import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { put } from '@vercel/blob';
import { requireAuth, ok, err } from '@/lib/api';
import { getExistingColumns, withTransaction } from '@/lib/db';
import { emitSocketEvent } from '@/lib/socket';

export const runtime = 'nodejs';

const ALLOWED_TYPES = new Set(['image/webp', 'image/png', 'image/jpeg']);
const MAX_FILE_BYTES = 5 * 1024 * 1024; // single screenshot, generous cap

function pad(n: number) { return String(n).padStart(2, '0'); }

export async function POST(req: NextRequest) {
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
    const finalExt = extension || 'png'; // file.type empty case, keep old default
    const blobKey = `screenshots/${employeeId}/${Date.now()}-${randomUUID()}.${finalExt}`;
    const blob = await put(blobKey, buffer, {
      access: 'public',
      contentType: file.type || 'image/webp',
      addRandomSuffix: false,
    });
    const publicUrl = blob.url;

    const availableColumns = await getExistingColumns('screenshots', ['blob_url', 'file_url', 'device_id']);
    const saved = await withTransaction(async (client) => {
      const urlColumns = ['blob_url', 'file_url'].filter((column) => availableColumns.has(column));
      if (!urlColumns.length) throw new Error('screenshots table is missing a URL column');

      const columns = ['employee_id', ...urlColumns, 'captured_at', 'active_app', 'activity_pct', 'session_id'];
      const values = [employeeId, ...urlColumns.map(() => publicUrl), capturedAt.toISOString(), activeApp, activityPct, sessionId];
      if (availableColumns.has('device_id')) {
        columns.splice(1, 0, 'device_id');
        values.splice(1, 0, deviceId);
      }
      const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
      const inserted = await client.query(
        `INSERT INTO screenshots (employee_id, device_id, blob_url, captured_at, active_app, activity_pct, session_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [employeeId, deviceId, blob.url, capturedAt.toISOString(), activeApp, activityPct, sessionId],
      );
      const id = inserted.rows[0].id;

      const presenceResult = await client.query(
        `INSERT INTO employee_status (employee_id, current_status, current_app, last_activity, updated_at)
         VALUES ($1, 'working', $2, NOW(), NOW())
         ON CONFLICT (employee_id) DO UPDATE SET current_app = $2, last_activity = NOW(), updated_at = NOW()
         RETURNING current_status`,
        [employeeId, activeApp],
      );
      return { id: inserted.rows[0].id };
    });

    await emitSocketEvent('new-screenshot', {
      userId: employeeId,
      userName: user.name,
      screenshotId: saved.id,
      blobUrl: blob.url,
      activeApp,
      activityPct,
      capturedAt: capturedAt.toISOString(),
    }, { toAdmins: true });

    return ok({ id: saved.id, blobUrl: blob.url }, 201);
  } catch (error: any) {
    console.error('POST /api/upload/screenshot error:', error?.message || error);
    return err('Failed to upload screenshot', 500);
  }
}