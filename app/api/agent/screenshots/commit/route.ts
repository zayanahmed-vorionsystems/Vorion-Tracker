import { NextRequest } from 'next/server';
import { requireAuth, ok, err } from '@/lib/api';
import { sql, withTransaction } from '@/lib/db';
import { assertSupabaseAdmin } from '@/lib/supabase';
import { emitSocketEvent } from '@/lib/socket';

const MAX_BATCH_SIZE = 30;

export async function POST(req: NextRequest) {
  if (!process.env.DATABASE_URL) return err('Server misconfigured: DATABASE_URL not set', 500);
  const user = requireAuth(req);
  if ('status' in user) return user;
  try {
    const input = (await req.json())?.screenshots;
    if (!Array.isArray(input) || input.length < 1 || input.length > MAX_BATCH_SIZE) return err('screenshots must contain 1 to 30 items', 400);
    const prefix = `screenshots/${user.sub}/`;
    const shots = input.map((item: any) => ({
      path: String(item?.path || ''), activeApp: String(item?.activeApp || 'Unknown').slice(0, 500),
      activityPct: Math.max(0, Math.min(100, Number.parseInt(String(item?.activityPct || 0), 10) || 0)),
      capturedAt: new Date(item?.capturedAt || Date.now()).toISOString(), sessionId: item?.sessionId ? String(item.sessionId) : null,
    }));
    if (shots.some((shot) => !shot.path.startsWith(prefix) || !/\.png$/i.test(shot.path))) return err('Invalid screenshot path', 400);
    const storage = assertSupabaseAdmin().storage.from('screenshots');
    const saved = await withTransaction(async (client) => {
      const rows = [];
      for (const shot of shots) {
        const fileUrl = storage.getPublicUrl(shot.path).data?.publicUrl || '';
        const result = await client.query(
          'INSERT INTO screenshots (employee_id, file_url, captured_at, active_app, activity_pct, session_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
          [user.sub, fileUrl, shot.capturedAt, shot.activeApp, shot.activityPct, shot.sessionId],
        );
        rows.push({ ...shot, id: result.rows[0].id, fileUrl });
      }
      const latest = rows[rows.length - 1];
      // Screenshots prove that the agent is connected, but they do not prove
      // keyboard or mouse activity. In particular, the agent keeps capturing
      // while a person is idle. Preserve the status last reported by its
      // heartbeat instead of turning every capture into "working".
      const presenceResult = await client.query(
        "INSERT INTO employee_status(employee_id, current_status, current_app, last_activity, updated_at) VALUES($1, 'working', $2, NOW(), NOW()) ON CONFLICT (employee_id) DO UPDATE SET current_app = $2, last_activity = NOW(), updated_at = NOW() RETURNING current_status",
        [user.sub, latest.activeApp],
      );
      return { rows, status: presenceResult.rows[0]?.current_status || 'working' };
    });
    const latest = saved.rows[saved.rows.length - 1];
    const presence = { employeeId: user.sub, employeeName: user.name, status: saved.status, currentApp: latest.activeApp, activityPct: latest.activityPct, lastActivity: new Date().toISOString(), timestamp: new Date().toISOString() };
    await emitSocketEvent('employee-status', presence, { toAdmins: true });
    await emitSocketEvent('employee-activity-updated', presence, { toAdmins: true });
    await Promise.all(saved.rows.map((shot) => emitSocketEvent('new-screenshot', { userId: user.sub, userName: user.name, screenshotId: shot.id, fileUrl: shot.fileUrl, activeApp: shot.activeApp, activityPct: shot.activityPct, capturedAt: shot.capturedAt }, { toAdmins: true })));
    return ok({ screenshots: saved.rows.map((shot) => ({ id: shot.id, path: shot.path })) }, 201);
  } catch (error: any) {
    console.error('POST /api/agent/screenshots/commit error:', error?.message || error);
    return err('Failed to save screenshots', 500);
  }
}
