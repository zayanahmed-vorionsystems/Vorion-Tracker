import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { requireAuth, err, ok } from '@/lib/api';
import { canAccessLiveMonitor, normalizeRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;
  if (!canAccessLiveMonitor(normalizeRole(user.role))) return err('Forbidden', 403);

  const rows = await sql`
    WITH active_attendance AS (
      SELECT DISTINCT ON (a.employee_id)
        a.employee_id,
        a.id AS attendance_id,
        a.check_in
      FROM attendance a
      WHERE a.check_out IS NULL
      ORDER BY a.employee_id, a.check_in DESC
    ),
    latest_screenshots AS (
      SELECT DISTINCT ON (s.employee_id)
        s.employee_id,
        s.file_url,
        s.captured_at
      FROM screenshots s
      ORDER BY s.employee_id, s.captured_at DESC
    )
    SELECT
      p.id AS employee_id,
      p.full_name AS employee_name,
      aa.attendance_id,
      es.current_status,
      es.current_app,
      es.last_activity,
      ls.file_url AS last_screenshot_url,
      ls.captured_at AS last_screenshot_at
    FROM public.profiles p
    LEFT JOIN active_attendance aa ON aa.employee_id = p.id
    LEFT JOIN employee_status es ON es.employee_id = p.id
    LEFT JOIN latest_screenshots ls ON ls.employee_id = p.id
    WHERE p.role = 'employee'
    ORDER BY p.full_name
  `;

  return ok(
    rows.map((row: any) => ({
      employeeId: row.employee_id,
      name: row.employee_name,
      status: row.current_status || 'offline',
      online: Boolean(row.attendance_id) && ['active', 'working', 'on_break', 'break'].includes(String(row.current_status || '').toLowerCase()),
      activeApp: row.current_app || undefined,
      lastSeen: row.last_activity || row.last_screenshot_at || null,
      lastUrl: row.last_screenshot_url || undefined,
    })),
  );
}
