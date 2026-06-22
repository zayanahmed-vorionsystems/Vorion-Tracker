// app/api/alerts/route.ts
import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { requireAuth, ok, err } from '@/lib/api';
import { pusherServer, CHANNELS, EVENTS } from '@/lib/pusher';
import { canSendAlerts } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const sender = requireAuth(req);
  if ('status' in sender) return sender;
  if (!canSendAlerts(sender.role)) return err('No permission to send alerts', 403);

  const { toUserId, message } = await req.json();
  if (!toUserId || !message) return err('toUserId and message required');

  const [alert] = await sql`
    INSERT INTO alerts(from_user_id, to_user_id, message)
    VALUES(${sender.sub}, ${toUserId}, ${message})
    RETURNING id, sent_at
  `;

  await pusherServer.trigger(CHANNELS.ALERTS, EVENTS.NEW_ALERT, {
    id: alert.id, fromName: sender.name, message, sentAt: alert.sent_at, toUserId,
  });

  return ok({ id: alert.id }, 201);
}

export async function GET(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;

  const alerts = await sql`
    SELECT a.*,u.name AS from_name FROM alerts a JOIN users u ON u.id=a.from_user_id
    WHERE a.to_user_id=${user.sub} ORDER BY a.sent_at DESC LIMIT 20
  `;
  return ok(alerts);
}
