// app/api/sessions/route.ts
import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { requireAuth, ok, err } from '@/lib/api';
import { pusherServer, CHANNELS, EVENTS } from '@/lib/pusher';

export async function POST(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;

  const { action, sessionId, notes, type, appName, windowTitle } = await req.json();

  if (action === 'start') {
    const [s] = await sql`INSERT INTO sessions(user_id) VALUES(${user.sub}) RETURNING id`;
    await pusherServer.trigger(CHANNELS.LIVE, EVENTS.EMPLOYEE_STATUS, {
      userId: user.sub, userName: user.name, status: 'online', sessionId: s.id,
    });
    return ok({ sessionId: s.id }, 201);
  }

  if (action === 'end' && sessionId) {
    await sql`
      UPDATE sessions SET ended_at=NOW(),
        duration_s=EXTRACT(EPOCH FROM (NOW()-started_at))::int,
        notes=${notes ?? null}
      WHERE id=${sessionId} AND user_id=${user.sub}
    `;
    await pusherServer.trigger(CHANNELS.LIVE, EVENTS.EMPLOYEE_STATUS, {
      userId: user.sub, userName: user.name, status: 'offline',
    });
    return ok({ ok: true });
  }

  if (action === 'activity') {
    await sql`
      INSERT INTO activity_events(user_id,session_id,type,app_name,window_title,detail)
      VALUES(${user.sub},${sessionId??null},${type},${appName??null},${windowTitle??null},${null})
    `;
    return ok({ ok: true });
  }

  return err('Invalid action');
}

export async function GET(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;
  const { role, sub } = user;
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') || new Date().toISOString().slice(0,10);

  let rows;
  if (role === 'employee') {
    rows = await sql`
      SELECT s.*,u.name AS user_name FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.user_id=${sub} AND DATE(s.started_at)=${date} ORDER BY s.started_at DESC
    `;
  } else {
    rows = await sql`
      SELECT s.*,u.name AS user_name FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE DATE(s.started_at)=${date} ORDER BY s.started_at DESC LIMIT 200
    `;
  }
  return ok(rows);
}
