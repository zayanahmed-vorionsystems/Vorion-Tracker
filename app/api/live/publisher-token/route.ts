import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { requireAuth, err, ok } from '@/lib/api';
import { createLiveKitToken, ensureLiveKitRoom, getLiveKitRoomName } from '@/lib/livekit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;

  const { sessionId } = await req.json();
  if (!sessionId) return err('sessionId is required', 400);

  const [attendance] = await sql`
    SELECT id, employee_id
    FROM attendance
    WHERE id = ${sessionId}
      AND employee_id = ${user.sub}
      AND check_out IS NULL
    LIMIT 1
  `;

  if (!attendance) {
    return err('Active session not found for this employee', 404);
  }

  const roomName = getLiveKitRoomName(user.sub, attendance.id);

  try {
    await ensureLiveKitRoom(roomName);
    const token = await createLiveKitToken({
      identity: `employee-${user.sub}`,
      roomName,
      canPublish: true,
      canSubscribe: false,
      metadata: JSON.stringify({ employeeId: user.sub, sessionId: attendance.id, role: user.role }),
      name: user.name,
    });

    return ok({
      ...token,
      sessionId: attendance.id,
      employeeId: user.sub,
    });
  } catch (error: any) {
    console.error('[live/publisher-token] failed', error?.stack || error);
    return err(error?.message || 'Failed to create publisher token', 500);
  }
}
