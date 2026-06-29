// app/api/recordings/route.ts
import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { requireAuth, ok, err } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase';
import { emitSocketEvent } from '@/lib/socket';

export async function POST(req: NextRequest) {
  if (!process.env.DATABASE_URL) return err('Server misconfigured: DATABASE_URL not set', 500);
  const user = requireAuth(req);
  if ('status' in user) return user;

  const formData   = await req.formData();
  const file       = formData.get('recording') as File | null;
  const sessionId  = formData.get('sessionId') as string | null;
  const duration   = parseInt(formData.get('duration') as string || '0');
  const capturedAt = formData.get('capturedAt') as string || new Date().toISOString();

  if (!file) return err('No recording file');

  const arrayBuffer = await file.arrayBuffer();
  const buffer      = Buffer.from(arrayBuffer);
  const filePath    = `recordings/${user.sub}/${Date.now()}.webm`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from('recordings')
    .upload(filePath, buffer, { contentType: file.type || 'audio/webm' });

  if (uploadError) {
    console.error('Supabase upload error', uploadError);
    return err('Failed to upload recording', 500);
  }

  const publicUrl = supabaseAdmin.storage.from('recordings').getPublicUrl(filePath).data?.publicUrl || '';

  try {
    const [rec] = await sql`
      INSERT INTO recordings (user_id, session_id, file_url, duration_seconds, captured_at)
      VALUES (${user.sub}, ${sessionId}, ${publicUrl}, ${duration || null}, ${capturedAt})
      RETURNING id
    `;

    await emitSocketEvent('new-screenshot', {
      userId:      user.sub,
      userName:    user.name,
      recordingId: rec.id,
      fileUrl:     publicUrl,
      durationSeconds: duration,
      capturedAt,
    }, { toAdmins: true });

    return ok({ id: rec.id }, 201);
  } catch (e: any) {
    console.error('POST /api/recordings error:', e?.message || e);
    return err(e?.message || 'Failed to save recording', 500);
  }
}

export async function GET(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;

  const { searchParams } = new URL(req.url);
  const filterUserId = searchParams.get('userId');
  const limit = parseInt(searchParams.get('limit') || '60');

  let rows;
  if (user.role === 'employee') {
    rows = await sql`
      SELECT r.*, p.full_name AS user_name
      FROM recordings r
      JOIN public.profiles p ON p.id = r.user_id
      WHERE r.user_id = ${user.sub}
      ORDER BY r.captured_at DESC
      LIMIT ${limit}
    `;
  } else if (filterUserId) {
    rows = await sql`
      SELECT r.*, p.full_name AS user_name
      FROM recordings r
      JOIN public.profiles p ON p.id = r.user_id
      WHERE r.user_id = ${filterUserId}
      ORDER BY r.captured_at DESC
      LIMIT ${limit}
    `;
  } else {
    rows = await sql`
      SELECT r.*, p.full_name AS user_name
      FROM recordings r
      JOIN public.profiles p ON p.id = r.user_id
      ORDER BY r.captured_at DESC
      LIMIT ${limit}
    `;
  }

  return ok(rows);
}
