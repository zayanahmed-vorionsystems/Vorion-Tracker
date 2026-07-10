// app/api/recordings/route.ts
import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { requireAuth, ok, err } from '@/lib/api';
import { assertSupabaseAdmin } from '@/lib/supabase';
import { emitSocketEvent } from '@/lib/socket';
import { canMonitorAll, normalizeRole } from '@/lib/roles';

const MAX_RECORDING_BYTES = 100 * 1024 * 1024;

function isAllowedRecordingType(type: string) {
  const normalized = String(type || '').trim().toLowerCase().replace(/\s+/g, '');
  return normalized === 'video/webm' || normalized.startsWith('video/webm;codecs=');
}

export async function POST(req: NextRequest) {
  if (!process.env.DATABASE_URL) return err('Server misconfigured: DATABASE_URL not set', 500);
  const user = requireAuth(req);
  if ('status' in user) return user;

  let admin;
  try {
    admin = assertSupabaseAdmin();
  } catch (e: any) {
    console.error('[recordings] Supabase admin unavailable:', e?.message || e);
    return err(e?.message || 'Server misconfigured: Supabase admin unavailable', 500);
  }

  const formData   = await req.formData();
  const file       = formData.get('recording') as File | null;
  const sessionId  = formData.get('sessionId') as string | null;
  const duration   = parseInt(formData.get('duration') as string || '0');
  const capturedAt = formData.get('capturedAt') as string || new Date().toISOString();

  if (!file) return err('No recording file');
  if (file.size <= 0) return err('Recording file is empty', 400);
  if (file.size > MAX_RECORDING_BYTES) return err('Recording file is too large', 413);
  if (!isAllowedRecordingType(file.type || '')) {
    console.error('[recordings] unsupported file type', { type: file.type, size: file.size });
    return err('Unsupported recording file type', 400);
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer      = Buffer.from(arrayBuffer);
  const filePath    = `recordings/${user.sub}/${Date.now()}.webm`;

  const { error: uploadError } = await admin.storage
    .from('recordings')
    .upload(filePath, buffer, { contentType: file.type || 'audio/webm' });

  if (uploadError) {
    console.error('Supabase upload error', uploadError);
    return err('Failed to upload recording', 500);
  }

  const publicUrl = admin.storage.from('recordings').getPublicUrl(filePath).data?.publicUrl || '';

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
  const role = normalizeRole(user.role);

  const { searchParams } = new URL(req.url);
  const filterUserId = searchParams.get('userId');
  const limit = parseInt(searchParams.get('limit') || '60');

  let rows;
  if (role === 'employee') {
    rows = await sql`
      SELECT r.*, p.full_name AS user_name
      FROM recordings r
      JOIN public.profiles p ON p.id = r.user_id
      WHERE r.user_id = ${user.sub}
      ORDER BY r.captured_at DESC
        LIMIT ${limit}
      `;
  } else if (canMonitorAll(role) && filterUserId) {
    rows = await sql`
      SELECT r.*, p.full_name AS user_name
      FROM recordings r
      JOIN public.profiles p ON p.id = r.user_id
      WHERE r.user_id = ${filterUserId}
      ORDER BY r.captured_at DESC
      LIMIT ${limit}
    `;
  } else if (canMonitorAll(role)) {
    rows = await sql`
      SELECT r.*, p.full_name AS user_name
      FROM recordings r
      JOIN public.profiles p ON p.id = r.user_id
      ORDER BY r.captured_at DESC
      LIMIT ${limit}
    `;
  } else {
    return err('Forbidden', 403);
  }

  return ok(rows);
}
