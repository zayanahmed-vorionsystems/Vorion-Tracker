import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { requireAuth, ok, err } from '@/lib/api';
import { emitSocketEvent } from '@/lib/socket';
import { normalizePresenceStatus } from '@/lib/status';

export async function POST(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;

  const { currentApp, activityPct, status: currentStatus, timestamp } = await req.json();
  const now = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();

  try {
    const statusValue = normalizePresenceStatus(currentStatus);

    await sql`
      INSERT INTO employee_status(employee_id, current_status, current_app, last_activity, updated_at)
      VALUES(${user.sub}, ${statusValue}, ${currentApp ?? null}, ${now}, NOW())
      ON CONFLICT (employee_id) DO UPDATE
      SET current_status = ${statusValue}, current_app = ${currentApp ?? null}, last_activity = ${now}, updated_at = NOW()
    `;

    const payload = {
      employeeId: user.sub,
      employeeName: user.name,
      status: statusValue,
      currentApp: currentApp || null,
      activityPct: activityPct ?? null,
      lastActivity: now,
      timestamp: now,
    };

    await emitSocketEvent('employee-status', payload, { toAdmins: true });
    await emitSocketEvent('employee-activity-updated', payload, { toAdmins: true });

    return ok({ ok: true });
  } catch (e: any) {
    console.error('POST /api/heartbeat error:', e?.message || e);
    return err(e?.message || 'Internal server error', 500);
  }
}
