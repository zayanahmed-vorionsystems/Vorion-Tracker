// app/api/upload/recording/route.ts
import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { put } from '@vercel/blob';
import { requireAuth, ok, err } from '@/lib/api';
import { withTransaction } from '@/lib/db';
import { emitSocketEvent } from '@/lib/socket';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 60s @ 2Mbps VP9/VP8 tops out well under this — generous safety cap only.
const MAX_RECORDING_BYTES = 25 * 1024 * 1024;
const MAX_DURATION_SECONDS = 60;

function pad(n: number) { return String(n).padStart(2, '0'); }

function isAllowedRecordingType(type: string) {
  // Browser MediaRecorder reports e.g. "video/webm;codecs=vp9,opus" — match
  // the container, not the exact codec string.
  return String(type || '').trim().toLowerCase().startsWith('video/webm');
}

export async function POST(req: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return err('Server misconfigured: BLOB_READ_WRITE_TOKEN not set', 500);
  if (!process.env.DATABASE_URL) return err('Server misconfigured: DATABASE_URL not set', 500);

  const user = requireAuth(req);
  if ('status' in user) return user;

  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return err('Missing file', 400);
    if (file.size <= 0) return err('Recording file is empty', 400);
    if (file.size > MAX_RECORDING_BYTES) return err('Recording file is too large', 413);
    if (!isAllowedRecordingType(file.type || '')) {
      return err('Only video/webm recordings are accepted', 400);
    }

    // employeeId is derived from the authenticated user, never trusted from
    // the form body — same rule as /api/upload/screenshot.
    const employeeId = user.sub;
    const sessionId = String(form.get('sessionId') || '').trim() || null;

    const startedAtRaw = form.get('startedAt');
    const endedAtRaw = form.get('endedAt');
    const startedAt = startedAtRaw ? new Date(String(startedAtRaw)) : null;
    const endedAt = endedAtRaw ? new Date(String(endedAtRaw)) : null;
    if (!startedAt || Number.isNaN(startedAt.getTime())) return err('Invalid startedAt', 400);
    if (!endedAt || Number.isNaN(endedAt.getTime())) return err('Invalid endedAt', 400);

    const durationSeconds = Number.parseFloat(String(form.get('duration') || ''));
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > MAX_DURATION_SECONDS) {
      return err(`Invalid duration (must be > 0 and <= ${MAX_DURATION_SECONDS}s)`, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const d = startedAt;
    const blobKey = `recordings/${employeeId}/${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/recording_${Date.now()}-${randomUUID()}.webm`;

    const blob = await put(blobKey, buffer, {
      access: 'public',
      contentType: file.type || 'video/webm',
      addRandomSuffix: false,
    });

    const saved = await withTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO recordings
           (employee_id, session_id, blob_url, duration_seconds, started_at, ended_at, size_bytes, mime_type, storage_provider)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'vercel_blob')
         RETURNING id`,
        [
          employeeId,
          sessionId,
          blob.url,
          Math.round(durationSeconds),
          startedAt.toISOString(),
          endedAt.toISOString(),
          buffer.length,
          file.type || 'video/webm',
        ],
      );
      return { id: inserted.rows[0].id };
    });

    await emitSocketEvent('new-recording', {
      userId: employeeId,
      userName: user.name,
      recordingId: saved.id,
      blobUrl: blob.url,
      sessionId,
      durationSeconds: Math.round(durationSeconds),
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
    }, { toAdmins: true });

    return ok({ success: true, id: saved.id, url: blob.url }, 201);
  } catch (error: any) {
    console.error('POST /api/upload/recording error:', error?.message || error);
    return err('Failed to upload recording', 500);
  }
}