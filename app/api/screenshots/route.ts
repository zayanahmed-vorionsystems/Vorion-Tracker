// app/api/screenshots/route.ts
import { NextRequest } from 'next/server';
import { put } from '@vercel/blob';
import { sql } from '@/lib/db';
import { requireAuth, ok, err } from '@/lib/api';
import { pusherServer, CHANNELS, EVENTS } from '@/lib/pusher';

// POST — employee agent uploads a screenshot
export async function POST(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;

  const formData  = await req.formData();
  const file      = formData.get('screenshot') as File | null;
  const activeApp = formData.get('activeApp') as string || 'Unknown';
  const actPct    = parseInt(formData.get('activityPct') as string || '0');
  const sessionId = formData.get('sessionId') as string | null;
  const capturedAt= formData.get('capturedAt') as string || new Date().toISOString();

  if (!file) return err('No screenshot file');

  // Upload to Vercel Blob
  const blob = await put(
    `screenshots/${user.sub}/${Date.now()}.png`,
    file,
    { access: 'public', contentType: 'image/png' }
  );

  const [ss] = await sql`
    INSERT INTO screenshots (user_id, session_id, file_url, active_app, activity_pct, captured_at)
    VALUES (${user.sub}, ${sessionId}, ${blob.url}, ${activeApp}, ${actPct}, ${capturedAt})
    RETURNING id
  `;

  // Broadcast to live monitor via Pusher
  await pusherServer.trigger(CHANNELS.LIVE, EVENTS.NEW_SCREENSHOT, {
    userId:        user.sub,
    userName:      user.name,
    screenshotId:  ss.id,
    fileUrl:       blob.url,
    activeApp,
    activityPct:   actPct,
    capturedAt,
  });

  return ok({ id: ss.id }, 201);
}

// GET — list screenshots (role-scoped)
export async function GET(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;
  const { role, teamId, sub } = user;

  const { searchParams } = new URL(req.url);
  const filterUserId = searchParams.get('userId');
  const date         = searchParams.get('date');
  const limit        = parseInt(searchParams.get('limit') || '60');

  let rows;
  const dateFilter = date
    ? sql`AND DATE(s.captured_at) = ${date}`
    : sql`AND DATE(s.captured_at) = CURRENT_DATE`;

  if (role === 'employee') {
    rows = await sql`
      SELECT s.*,u.name AS user_name FROM screenshots s JOIN users u ON u.id=s.user_id
      WHERE s.user_id=${sub} ${dateFilter} ORDER BY s.captured_at DESC LIMIT ${limit}
    `;
  } else if (role === 'team_lead') {
    rows = await sql`
      SELECT s.*,u.name AS user_name FROM screenshots s JOIN users u ON u.id=s.user_id
      WHERE u.team_id=(SELECT team_id FROM users WHERE id=${sub}) ${dateFilter}
      ORDER BY s.captured_at DESC LIMIT ${limit}
    `;
  } else if (filterUserId) {
    rows = await sql`
      SELECT s.*,u.name AS user_name FROM screenshots s JOIN users u ON u.id=s.user_id
      WHERE s.user_id=${filterUserId} ${dateFilter} ORDER BY s.captured_at DESC LIMIT ${limit}
    `;
  } else {
    rows = await sql`
      SELECT s.*,u.name AS user_name FROM screenshots s JOIN users u ON u.id=s.user_id
      WHERE 1=1 ${dateFilter} ORDER BY s.captured_at DESC LIMIT ${limit}
    `;
  }
  return ok(rows);
}
