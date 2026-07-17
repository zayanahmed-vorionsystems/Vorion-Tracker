import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { put } from '@vercel/blob';
import { requireAuth, ok, err } from '@/lib/api';
import { getExistingColumns, withTransaction } from '@/lib/db';
import { emitSocketEvent } from '@/lib/socket';

export const runtime = 'nodejs';

const MAX_FILE_BYTES = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  if (!process.env.DATABASE_URL) return err('Server misconfigured: DATABASE_URL not set', 500);

  const user = requireAuth(req);
  if ('status' in user) return user;

  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return err('Missing file', 400);

    // Accept both PNG (fallback) and WebP (normal, compressed) from the agent.
    const ALLOWED_TYPES: Record<string, string> = {
      'image/png': 'png',
      'image/webp': 'webp',
    };
    const extension = file.type ? ALLOWED_TYPES[file.type] : undefined;
    if (file.type && !extension) return err('Only PNG or WebP screenshots are accepted', 400);
    if (file.size > MAX_FILE_BYTES) return err('Screenshot too large', 400);

    const employeeId = user.sub;
    const deviceId = String(form.get('deviceId') || '').trim() || null;
    const activeApp = String(form.get('activeApp') || 'Unknown').slice(0, 500);
    const activityPct = Math.max(0, Math.min(100, Number.parseInt(String(form.get('activityPct') || '0'), 10) || 0));

    const capturedAtRaw = form.get('capturedAt');
    const capturedAt = capturedAtRaw ? new Date(String(capturedAtRaw)) : new Date();
    if (Number.isNaN(capturedAt.getTime())) return err('Invalid capturedAt', 400);

    const sessionId = form.get('sessionId') ? String(form.get('sessionId')) : null;

    const finalExt = extension || 'png'; // file.type empty case, keep old default
    const blobKey = `screenshots/${employeeId}/${Date.now()}-${randomUUID()}.${finalExt}`;
    console.info('[blob-upload] server-put-start', {
      route: '/api/upload/screenshot',
      caller: 'legacy-agent-screenshot-upload',
      pathname: blobKey,
      userId: employeeId,
      deviceId,
      bytes: file.size,
      attempt: 1,
      firstAttempt: true,
    });
    const blob = await put(blobKey, file, {
      access: 'public',
      contentType: file.type || 'image/png',
      addRandomSuffix: false,
    });
    console.info('[blob-upload] server-put-complete', {
      route: '/api/upload/screenshot',
      caller: 'legacy-agent-screenshot-upload',
      pathname: blob.pathname,
      url: blob.url,
      userId: employeeId,
      deviceId,
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
        `INSERT INTO screenshots (${columns.join(', ')}) VALUES (${placeholders}) RETURNING id`,
        values,
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
      blobUrl: publicUrl,
      fileUrl: publicUrl,
      activeApp,
      activityPct,
      capturedAt: capturedAt.toISOString(),
    }, { toAdmins: true });

    return ok({ id: saved.id, blobUrl: publicUrl }, 201);
  } catch (error: any) {
    console.error('POST /api/upload/screenshot error:', error?.message || error);
    return err('Failed to upload screenshot', 500);
  }
}
