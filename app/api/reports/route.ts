// app/api/reports/route.ts
import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { requireAuth, ok, err } from '@/lib/api';

export async function GET(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;

  const { searchParams } = new URL(req.url);
  const type   = searchParams.get('type') || 'daily';
  const date   = searchParams.get('date') || new Date().toISOString().slice(0, 10);
  const isEmployee = user.role === 'employee';
  const isTeamLead = user.role === 'team_lead';

  try {

    // ── DAILY DASHBOARD SUMMARY ──────────────────────────────────────────
    if (type === 'daily') {
      const rows = await sql`
        WITH break_summary AS (
          SELECT
            attendance_id,
            COALESCE(SUM(COALESCE(duration_minutes, 0)), 0) AS break_minutes
          FROM breaks
          GROUP BY attendance_id
        ),
        attendance_summary AS (
          SELECT
            a.employee_id,
            MAX(a.check_out) AS last_check_out,
            SUM(
              CASE
                WHEN a.status IN ('checked_out', 'on_break') THEN
                  GREATEST(0, COALESCE(a.total_minutes, 0) - COALESCE(b.break_minutes, 0))
                WHEN es.last_activity IS NOT NULL AND es.last_activity < NOW() - INTERVAL '3 minutes' THEN
                  GREATEST(
                    0,
                    FLOOR(EXTRACT(EPOCH FROM (es.last_activity - a.check_in)) / 60)::int
                    - COALESCE(b.break_minutes, 0)
                  )
                ELSE
                  GREATEST(
                    0,
                    FLOOR(EXTRACT(EPOCH FROM (NOW() - a.check_in)) / 60)::int
                    - COALESCE(b.break_minutes, 0)
                  )
              END
            ) AS total_minutes
          FROM attendance a
          LEFT JOIN break_summary   b  ON b.attendance_id = a.id
          LEFT JOIN employee_status es ON es.employee_id  = a.employee_id
          WHERE DATE(a.check_in) = ${date}
          GROUP BY a.employee_id
        ),
        screenshot_summary AS (
          SELECT
            employee_id,
            COUNT(*) AS screenshot_count
          FROM screenshots
          WHERE DATE(captured_at) = ${date}
          GROUP BY employee_id
        ),
        activity_summary AS (
          SELECT
            employee_id,
            AVG(activity_pct)                          AS avg_activity_pct,
            COUNT(*)                                   AS activity_record_count
          FROM screenshots
          WHERE DATE(captured_at) = ${date}
            AND activity_pct IS NOT NULL
          GROUP BY employee_id
        )
        SELECT
          p.id,
          p.full_name                                  AS name,
          p.role,
          p.department_id,
          COALESCE(a.total_minutes, 0) * 60            AS total_seconds,
          COALESCE(ss.screenshot_count, 0)             AS screenshot_count,
          CASE
            WHEN COALESCE(act.activity_record_count, 0) = 0 THEN NULL
            ELSE LEAST(ROUND(COALESCE(act.avg_activity_pct, 0), 1), 100)
          END                                          AS avg_activity_pct,
          GREATEST(
            COALESCE(a.last_check_out, '1970-01-01'::timestamptz),
            COALESCE(es.last_activity, '1970-01-01'::timestamptz)
          )                                            AS last_active,
          CASE
            WHEN es.last_activity IS NULL OR es.last_activity < NOW() - INTERVAL '3 minutes' THEN 'offline'
            WHEN es.current_status IN ('active', 'working') THEN 'working'
            WHEN es.current_status IN ('break', 'on_break') THEN 'on_break'
            WHEN es.current_status IN ('checked_out', 'checkout', 'check_out') THEN 'checked_out'
            ELSE es.current_status
          END                                          AS current_status,
          es.current_app
        FROM public.profiles p
        LEFT JOIN attendance_summary  a   ON a.employee_id   = p.id
        LEFT JOIN screenshot_summary  ss  ON ss.employee_id  = p.id
        LEFT JOIN activity_summary    act ON act.employee_id = p.id
        LEFT JOIN employee_status     es  ON es.employee_id  = p.id
        WHERE p.role = 'employee'
          AND (
            (${isEmployee} = true AND p.id = ${user.sub})
            OR (${isTeamLead} = true AND p.department_id = ${user.teamId})
            OR (${isEmployee} = false AND ${isTeamLead} = false)
          )
        ORDER BY total_seconds DESC
      `;
      return ok({ date, rows });
    }

    // ── WEEKLY SUMMARY ───────────────────────────────────────────────────
    if (type === 'weekly') {
      const rows = await sql`
        WITH break_summary AS (
          SELECT
            attendance_id,
            COALESCE(SUM(COALESCE(duration_minutes, 0)), 0) AS break_minutes
          FROM breaks
          GROUP BY attendance_id
        ),
        attendance_weekly AS (
          SELECT
            DATE(a.check_in) AS day,
            a.employee_id,
            a.check_in,
            a.check_out,
            a.total_minutes,
            COALESCE(b.break_minutes, 0) AS break_minutes
          FROM attendance a
          LEFT JOIN break_summary b ON b.attendance_id = a.id
          JOIN public.profiles p ON p.id = a.employee_id
          WHERE a.check_in >= NOW() - INTERVAL '7 days'
            AND p.role = 'employee'
            AND (
              (${isEmployee} = true AND a.employee_id = ${user.sub})
              OR (${isTeamLead} = true AND p.department_id = ${user.teamId})
              OR (${isEmployee} = false AND ${isTeamLead} = false)
            )
        )
        SELECT
          day,
          COUNT(DISTINCT employee_id)                  AS active_users,
          COALESCE(SUM(
            CASE
              WHEN check_out IS NOT NULL THEN GREATEST(0, COALESCE(total_minutes, 0) - break_minutes)
              ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - check_in)) / 60)::int - break_minutes)
            END
          ), 0) * 60                                   AS total_seconds,
          (
            SELECT COUNT(*)
            FROM screenshots s
            JOIN public.profiles sp ON sp.id = s.employee_id
            WHERE DATE(s.captured_at) = day
              AND (
                (${isEmployee} = true AND s.employee_id = ${user.sub})
                OR (${isTeamLead} = true AND sp.department_id = ${user.teamId})
                OR (${isEmployee} = false AND ${isTeamLead} = false)
              )
          )                                            AS screenshots
        FROM attendance_weekly
        GROUP BY day
        ORDER BY day
      `;
      return ok(rows);
    }

    return ok([]);

  } catch (e: any) {
    console.error('GET /api/reports error:', e?.message || e);
    return err(e?.message || 'Internal server error', 500);
  }
}
