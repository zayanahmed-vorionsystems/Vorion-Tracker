import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { put } from '@vercel/blob';
import { requireAuth, ok, err } from '@/lib/api';
import { withTransaction } from '@/lib/db';
import { emitSocketEvent } from '@/lib/socket';

export const runtime = 'nodejs';

const ALLOWED_TYPES = new Set(['image/webp', 'image/png', 'image/jpeg']);
const MAX_FILE_BYTES = 5 * 1024 * 1024; // single screenshot, generous cap

function pad(n: number) { return String(n).padStart(2, '0'); }

export async function POST(req: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return err('Server misconfigured: BLOB_READ_WRITE_TOKEN not set', 500);
  if (!process.env.DATABASE_URL) return err('Server misconfigured: DATABASE_URL not set', 500);

  const user = requireAuth(req);
  if ('status' in user) return user;

  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return err('Missing file', 400);
    if (file.type && !ALLOWED_TYPES.has(file.type)) {
      return err('Only image screenshots (webp/png/jpeg) are accepted', 400);
    }
    if (file.size > MAX_FILE_BYTES) return err('Screenshot too large', 400);

    const employeeId = user.sub;
    const deviceId = String(form.get('deviceId') || '').trim() || null;
    const activeApp = String(form.get('activeApp') || '').trim() || null;
    const activityPct = Math.max(0, Math.min(100, Number.parseInt(String(form.get('activityPct') || '0'), 10) || 0));
    const sessionId = String(form.get('sessionId') || '').trim() || null;

    const capturedAtRaw = form.get('capturedAt');
    const capturedAt = capturedAtRaw ? new Date(String(capturedAtRaw)) : null;
    if (!capturedAt || Number.isNaN(capturedAt.getTime())) return err('Invalid capturedAt', 400);

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/jpeg' ? 'jpg' : 'webp';

    const d = capturedAt;
    const blobKey = `screenshots/${employeeId}/${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/screenshot_${Date.now()}-${randomUUID()}.${ext}`;

    const blob = await put(blobKey, buffer, {
      access: 'public',
      contentType: file.type || 'image/webp',
      addRandomSuffix: false,
    });

    const saved = await withTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO screenshots
           (employee_id, session_id, device_id, blob_url, active_app, activity_pct, captured_at, size_bytes, mime_type, storage_provider)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'vercel_blob')
         RETURNING id`,
        [employeeId, sessionId, deviceId, blob.url, activeApp, activityPct, capturedAt.toISOString(), buffer.length, file.type || 'image/webp'],
      );
      return { id: inserted.rows[0].id };
    });

    await emitSocketEvent('new-screenshot', {
      userId: employeeId,
      userName: user.name,
      screenshotId: saved.id,
      blobUrl: blob.url,
      sessionId,
      activeApp,
      activityPct,
      capturedAt: capturedAt.toISOString(),
    }, { toAdmins: true });

    return ok({ success: true, id: saved.id, url: blob.url }, 201);
  } catch (error: any) {
    console.error('POST /api/upload/screenshot error:', error?.message || error);
    return err('Failed to upload screenshot', 500);
  }
}