import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { put } from '@vercel/blob';
import { requireAuth, ok, err } from '@/lib/api';
import { withTransaction } from '@/lib/db';
import { emitSocketEvent } from '@/lib/socket';

export const runtime = 'nodejs';

const MAX_FILE_BYTES = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return err('Server misconfigured: BLOB_READ_WRITE_TOKEN not set', 500);
  if (!process.env.DATABASE_URL) return err('Server misconfigured: DATABASE_URL not set', 500);

  const user = requireAuth(req);
  if ('status' in user) return user;

  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return err('Missing file', 400);
    if (file.type && file.type !== 'image/png') return err('Only PNG screenshots are accepted', 400);
    if (file.size > MAX_FILE_BYTES) return err('Screenshot too large', 400);

    const employeeId = user.sub;
    const deviceId = String(form.get('deviceId') || '').trim() || null;
    const activeApp = String(form.get('activeApp') || 'Unknown').slice(0, 500);
    const activityPct = Math.max(0, Math.min(100, Number.parseInt(String(form.get('activityPct') || '0'), 10) || 0));

    const capturedAtRaw = form.get('capturedAt');
    const capturedAt = capturedAtRaw ? new Date(String(capturedAtRaw)) : new Date();
    if (Number.isNaN(capturedAt.getTime())) return err('Invalid capturedAt', 400);

    const sessionId = form.get('sessionId') ? String(form.get('sessionId')) : null;

    const buffer = Buffer.from(await file.arrayBuffer());
    const blobKey = `screenshots/${employeeId}/${Date.now()}-${randomUUID()}.png`;
    const blob = await put(blobKey, buffer, {
      access: 'public',
      contentType: 'image/png',
      addRandomSuffix: false,
    });

    const saved = await withTransaction(async (client) => {
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

      return { id, status: presenceResult.rows[0]?.current_status || 'working' };
    });

    const presence = {
      employeeId,
      employeeName: user.name,
      status: saved.status,
      currentApp: activeApp,
      activityPct,
      lastActivity: new Date().toISOString(),
      timestamp: new Date().toISOString(),
    };

    await emitSocketEvent('employee-status', presence, { toAdmins: true });
    await emitSocketEvent('employee-activity-updated', presence, { toAdmins: true });
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
