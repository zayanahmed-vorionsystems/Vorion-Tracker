import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { requireAuth, err, ok } from '@/lib/api';
import { createLiveKitToken, getLiveKitRoomName } from '@/lib/livekit';
import { canAccessLiveMonitor, normalizeRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;
  if (!canAccessLiveMonitor(normalizeRole(user.role))) return err('Forbidden', 403);

  const { employeeId } = await req.json();
  if (!employeeId) return err('employeeId is required', 400);

  const [attendance] = await sql`
    SELECT a.id, a.employee_id, p.full_name
    FROM attendance a
    JOIN public.profiles p ON p.id = a.employee_id
    WHERE a.employee_id = ${employeeId}
      AND a.check_out IS NULL
    ORDER BY a.check_in DESC
    LIMIT 1
  `;

  if (!attendance) {
    return err('Employee is not currently streaming', 404);
  }

  try {
    const roomName = getLiveKitRoomName(attendance.employee_id, attendance.id);
    const viewerConnectionId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const token = await createLiveKitToken({
      identity: `viewer-${user.sub}-${employeeId}-${viewerConnectionId}`,
      roomName,
      canPublish: false,
      canSubscribe: true,
      metadata: JSON.stringify({ viewerId: user.sub, employeeId, role: user.role }),
      name: user.name,
    });

    return ok({
      ...token,
      employeeId: attendance.employee_id,
      employeeName: attendance.full_name,
      sessionId: attendance.id,
    });
  } catch (error: any) {
    console.error('[live/viewer-token] failed', error?.stack || error);
    return err(error?.message || 'Failed to create viewer token', 500);
  }
}
