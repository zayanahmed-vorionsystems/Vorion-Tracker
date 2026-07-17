// app/api/live/self-stop/route.ts
import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { requireAuth, err, ok } from '@/lib/api';
import { getLiveKitRoomName, getLiveKitRoomService } from '@/lib/livekit';

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
    LIMIT 1
  `;

  if (!attendance) return ok({ ok: true, alreadyStopped: true });

  const roomName = getLiveKitRoomName(attendance.employee_id, attendance.id);
  await getLiveKitRoomService().deleteRoom(roomName).catch(() => undefined);
  return ok({ ok: true, roomName });
}