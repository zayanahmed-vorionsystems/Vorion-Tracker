// app/api/reports/route.ts
import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { requireAuth, ok } from '@/lib/api';

export async function GET(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;

  const { searchParams } = new URL(req.url);
  const type   = searchParams.get('type') || 'daily';
  const date   = searchParams.get('date') || new Date().toISOString().slice(0, 10);
  const userId = searchParams.get('userId');

  if (type === 'daily') {
    const rows = await sql`
      SELECT
        u.id, u.name, u.role,
        COUNT(DISTINCT se.id)           AS session_count,
        COALESCE(SUM(se.duration_s),0)  AS total_seconds,
        COUNT(DISTINCT ss.id)           AS screenshot_count,
        COALESCE(ROUND(AVG(ss.activity_pct)),0) AS avg_activity_pct,
        MAX(se.ended_at)                AS last_active
      FROM users u
      LEFT JOIN sessions    se ON se.user_id=u.id AND DATE(se.started_at)=${date}
      LEFT JOIN screenshots ss ON ss.user_id=u.id AND DATE(ss.captured_at)=${date}
      WHERE u.is_active=true AND u.role='employee'
      GROUP BY u.id,u.name,u.role
      ORDER BY total_seconds DESC
    `;
    return ok({ date, rows });
  }

  if (type === 'app-usage' && userId) {
    const rows = await sql`
      SELECT active_app, COUNT(*) AS count,
        ROUND(COUNT(*)*100.0/SUM(COUNT(*)) OVER(),1) AS pct
      FROM screenshots
      WHERE user_id=${userId} AND DATE(captured_at)=${date} AND active_app IS NOT NULL
      GROUP BY active_app ORDER BY count DESC LIMIT 12
    `;
    return ok(rows);
  }

  if (type === 'weekly') {
    const rows = await sql`
      SELECT DATE(se.started_at) AS day,
        COUNT(DISTINCT se.user_id) AS active_users,
        COALESCE(SUM(se.duration_s),0) AS total_seconds,
        COUNT(DISTINCT ss.id) AS screenshots
      FROM sessions se
      LEFT JOIN screenshots ss ON ss.user_id=se.user_id
        AND DATE(ss.captured_at)=DATE(se.started_at)
      WHERE se.started_at >= NOW() - INTERVAL '7 days'
      GROUP BY day ORDER BY day
    `;
    return ok(rows);
  }

  return ok([]);
}
