// app/api/screenshots/route.ts
import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { del, put } from '@vercel/blob';
import { getExistingColumns, queryRows, sql, withTransaction } from '@/lib/db';
import { requireAuth, ok, err } from '@/lib/api';
import { emitSocketEvent } from '@/lib/socket';
import { assertSupabaseAdmin } from '@/lib/supabase';
import { canDeleteRecords, canMonitorAll, normalizeRole } from '@/lib/roles';
import {
  BUSINESS_TIME_ZONE,
  getLocalDateInTimeZone,
  getShiftDateInTimeZone,
  getShiftRangeForDate,
  getShiftWindowsForDate,
} from '@/lib/shifts';

const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;

function isAllowedScreenshotType(type: string) {
  const normalized = String(type || '').trim().toLowerCase();
  return normalized === 'image/png' || normalized === 'image/jpeg' || normalized === 'image/webp';
}

function getSupabaseObjectPath(publicUrl: string) {
  try {
    const pathname = new URL(publicUrl).pathname;
    const marker = '/storage/v1/object/public/screenshots/';
    const index = pathname.indexOf(marker);
    if (index === -1) return null;
    return decodeURIComponent(pathname.slice(index + marker.length));
  } catch {
    return null;
  }
}

function getScreenshotUrlExpression(columns: Set<string>, tableAlias = 's') {
  const hasBlobUrl = columns.has('blob_url');
  const hasFileUrl = columns.has('file_url');
  if (hasBlobUrl && hasFileUrl) return `COALESCE(${tableAlias}.blob_url, ${tableAlias}.file_url)`;
  if (hasBlobUrl) return `${tableAlias}.blob_url`;
  if (hasFileUrl) return `${tableAlias}.file_url`;
  throw new Error('screenshots table is missing a URL column');
}

export async function POST(req: NextRequest) {
  if (!process.env.DATABASE_URL) return err('Server misconfigured: DATABASE_URL not set', 500);
  const user = requireAuth(req);
  if ('status' in user) return user;

  try {
    const formData   = await req.formData();
    const file       = formData.get('screenshot') as File | null;
    const sessionId  = formData.get('sessionId') as string | null;
    const capturedAt = formData.get('capturedAt') as string || new Date().toISOString();

    const activeApp = formData.get('activeApp') as string || 'Unknown';
    const actPct    = parseInt(formData.get('activityPct') as string || '0');

    if (!file) return err('No screenshot file');
    if (file.size <= 0) return err('Screenshot file is empty', 400);
    if (file.size > MAX_SCREENSHOT_BYTES) return err('Screenshot file is too large', 413);
    if (!isAllowedScreenshotType(file.type || '')) {
      return err('Unsupported screenshot file type', 400);
    }

    const extension   = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/webp' ? 'webp' : 'png';
    const blobKey      = `screenshots/${user.sub}/${Date.now()}-${randomUUID()}.${extension}`;

    console.info('[blob-upload] server-put-start', {
      route: '/api/screenshots',
      caller: 'screenshot-form-post',
      pathname: blobKey,
      userId: user.sub,
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
      route: '/api/screenshots',
      caller: 'screenshot-form-post',
      pathname: blob.pathname,
      url: blob.url,
      userId: user.sub,
    });
    const publicUrl = blob.url;

    const availableColumns = await getExistingColumns('screenshots', ['blob_url', 'file_url']);
    const ss = await withTransaction(async (client) => {
      const urlColumns = ['blob_url', 'file_url'].filter((column) => availableColumns.has(column));
      if (!urlColumns.length) throw new Error('screenshots table is missing a URL column');

      const columns = ['employee_id', ...urlColumns, 'captured_at', 'active_app', 'activity_pct', 'session_id'];
      const values = [user.sub, ...urlColumns.map(() => publicUrl), capturedAt, activeApp, actPct, sessionId];
      const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
      const inserted = await client.query(
        `INSERT INTO screenshots (${columns.join(', ')}) VALUES (${placeholders}) RETURNING id`,
        values,
      );
      return inserted.rows[0];
    });

    const presenceTimestamp = new Date().toISOString();
    const [presenceRow] = await sql`
      INSERT INTO employee_status(employee_id, current_status, current_app, last_activity, updated_at)
      VALUES(${user.sub}, 'working', ${activeApp}, ${presenceTimestamp}, NOW())
      ON CONFLICT (employee_id) DO UPDATE
      SET current_app = ${activeApp},
          last_activity = ${presenceTimestamp},
          updated_at = NOW()
      RETURNING current_status
    `;
    const presenceStatus = presenceRow?.current_status || 'working';

    const presencePayload = {
      employeeId: user.sub,
      employeeName: user.name,
      status: presenceStatus,
      currentApp: activeApp,
      activityPct: actPct,
      lastActivity: presenceTimestamp,
      timestamp: presenceTimestamp,
    };

    await emitSocketEvent('employee-status', presencePayload, { toAdmins: true });
    await emitSocketEvent('employee-activity-updated', presencePayload, { toAdmins: true });

    await emitSocketEvent('new-screenshot', {
      userId:       user.sub,
      userName:     user.name,
      screenshotId: ss.id,
      fileUrl:      publicUrl,
      activeApp,
      activityPct:  actPct,
      capturedAt,
    }, { toAdmins: true });

    return ok({ id: ss.id }, 201);
  } catch (e: any) {
    console.error('POST /api/screenshots error:', e?.message || e);
    return err(e?.message || 'Failed to save screenshot', 500);
  }
}

export async function GET(req: NextRequest) {
  if (!process.env.DATABASE_URL) return err('Server misconfigured: DATABASE_URL not set', 500);
  const user = requireAuth(req);
  if ('status' in user) return user;
  const role = normalizeRole(user.role);
  const { sub } = user;

  try {
    const { searchParams } = new URL(req.url);
    const filterUserId = searchParams.get('userId');
    const requestedDate = searchParams.get('date');
    const requestedLimit = parseInt(searchParams.get('limit') || '60', 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 60;
    const before = searchParams.get('before');
    const beforeDate = before ? new Date(before) : null;
    if (beforeDate && Number.isNaN(beforeDate.getTime())) return err('Invalid pagination cursor', 400);
    const beforeIso = beforeDate?.toISOString() || '9999-12-31T23:59:59.999Z';
    const timeZone     = searchParams.get('tz') || 'America/New_York';
    const effectiveTimeZone = role === 'client' ? BUSINESS_TIME_ZONE : timeZone;
    const date = requestedDate ?? (
      role === 'client'
        ? getShiftDateInTimeZone(new Date(), effectiveTimeZone)
        : getLocalDateInTimeZone(new Date(), effectiveTimeZone)
    );
    const availableColumns = await getExistingColumns('screenshots', ['blob_url', 'file_url']);
    const screenshotUrlExpression = getScreenshotUrlExpression(availableColumns);

    let rows;

    if (role === 'employee') {
      rows = await queryRows(
        `SELECT s.id, s.employee_id, ${screenshotUrlExpression} AS file_url, s.captured_at, s.created_at, s.active_app, s.activity_pct, p.full_name AS user_name
        FROM screenshots s
        JOIN public.profiles p ON p.id = s.employee_id
        WHERE s.employee_id = $1
          AND DATE(s.captured_at) = $2
          AND s.captured_at < $3
        ORDER BY s.captured_at DESC
        LIMIT $4`,
        [sub, date, beforeIso, limit],
      );
    } else if (role === 'client') {
      const assignedRows = filterUserId
        ? await sql`
            SELECT p.id, ca.shift_type AS assignment_shift_type
            FROM client_assignments ca
            JOIN public.profiles p ON p.id = ca.employee_id
            WHERE ca.client_id = ${sub}
              AND p.id = ${filterUserId}
          `
        : await sql`
            SELECT p.id, ca.shift_type AS assignment_shift_type
            FROM client_assignments ca
            JOIN public.profiles p ON p.id = ca.employee_id
            WHERE ca.client_id = ${sub}
          `;

      if (!assignedRows.length) {
        return ok([]);
      }

      const values: any[] = [];
      const valueRows = assignedRows.map((assigned: any) => {
        const shiftType = assigned.assignment_shift_type || 'full_time';
        const shiftRange = getShiftRangeForDate(date, shiftType);
        const shiftWindows = getShiftWindowsForDate(date, shiftType);
        const firstWindow = shiftWindows[0];
        const secondWindow = shiftWindows[1] || firstWindow;
        const hasSecondWindow = shiftWindows.length > 1;
        const rowValues = [
          assigned.id,
          shiftRange.startIso,
          shiftRange.endIso,
          firstWindow.start.toISOString(),
          firstWindow.end.toISOString(),
          hasSecondWindow,
          secondWindow.start.toISOString(),
          secondWindow.end.toISOString(),
        ];
        values.push(...rowValues);
        const offset = values.length - rowValues.length;
        return `($${offset + 1}::uuid, $${offset + 2}::timestamptz, $${offset + 3}::timestamptz, $${offset + 4}::timestamptz, $${offset + 5}::timestamptz, $${offset + 6}::boolean, $${offset + 7}::timestamptz, $${offset + 8}::timestamptz)`;
      });
      values.push(beforeIso, limit);
      const beforeIndex = values.length - 1;
      const limitIndex = values.length;
      rows = await queryRows(
        `WITH assignment_windows(employee_id, shift_start, shift_end, first_start, first_end, has_second, second_start, second_end) AS (
           VALUES ${valueRows.join(', ')}
         )
         SELECT s.id, s.employee_id, ${screenshotUrlExpression} AS file_url, s.captured_at, s.created_at, s.active_app, s.activity_pct, p.full_name AS user_name
         FROM screenshots s
         JOIN assignment_windows aw ON aw.employee_id = s.employee_id
         JOIN public.profiles p ON p.id = s.employee_id
         WHERE s.captured_at >= aw.shift_start
           AND s.captured_at < aw.shift_end
           AND s.captured_at < $${beforeIndex}::timestamptz
           AND (
             (s.captured_at >= aw.first_start AND s.captured_at < aw.first_end)
             OR (aw.has_second AND s.captured_at >= aw.second_start AND s.captured_at < aw.second_end)
           )
         ORDER BY s.captured_at DESC
         LIMIT $${limitIndex}`,
        values,
      );
    } else if (canMonitorAll(role)) {
      if (filterUserId) {
        rows = await queryRows(
          `SELECT s.id, s.employee_id, ${screenshotUrlExpression} AS file_url, s.captured_at, s.created_at, s.active_app, s.activity_pct, p.full_name AS user_name
          FROM screenshots s
          JOIN public.profiles p ON p.id = s.employee_id
          WHERE s.employee_id = $1
            AND DATE(s.captured_at) = $2
            AND s.captured_at < $3
          ORDER BY s.captured_at DESC
          LIMIT $4`,
          [filterUserId, date, beforeIso, limit],
        );
      } else {
        rows = await queryRows(
          `SELECT s.id, s.employee_id, ${screenshotUrlExpression} AS file_url, s.captured_at, s.created_at, s.active_app, s.activity_pct, p.full_name AS user_name
          FROM screenshots s
          JOIN public.profiles p ON p.id = s.employee_id
          WHERE DATE(s.captured_at) = $1
            AND s.captured_at < $2
          ORDER BY s.captured_at DESC
          LIMIT $3`,
          [date, beforeIso, limit],
        );
      }
    } else {
      return err('Forbidden', 403);
    }

    return ok(rows);
  } catch (e: any) {
    console.error('GET /api/screenshots error', e);
    return err(e?.message || 'Internal server error', 500);
  }
}

export async function DELETE(req: NextRequest) {
  if (!process.env.DATABASE_URL) return err('Server misconfigured: DATABASE_URL not set', 500);
  const authUser = requireAuth(req);
  if ('status' in authUser) return authUser;
  if (!canDeleteRecords(normalizeRole(authUser.role))) return err('Forbidden', 403);

  const { searchParams } = new URL(req.url);
  let id = searchParams.get('id');
  try {
    if (!id) {
      const body = await req.json().catch(() => null);
      id = body?.id;
    }
  } catch {}

  if (!id) return err('Missing screenshot id', 400);

  try {
    const availableColumns = await getExistingColumns('screenshots', ['blob_url', 'file_url']);
    const screenshotUrlExpression = getScreenshotUrlExpression(availableColumns);
    const rows = await queryRows(
      `SELECT id, employee_id, ${screenshotUrlExpression} AS blob_url FROM screenshots WHERE id = $1 LIMIT 1`,
      [id],
    );
    const rec = rows?.[0];
    if (!rec) return err('Screenshot not found', 404);

    try {
      const blobUrl: string = rec.blob_url || '';
      if (blobUrl) {
        if (blobUrl.includes('.blob.vercel-storage.com/')) {
          await del(blobUrl);
        } else {
          const objectPath = getSupabaseObjectPath(blobUrl);
          if (objectPath) {
          const { error: removeError } = await assertSupabaseAdmin().storage.from('screenshots').remove([objectPath]);
          if (removeError) throw removeError;
          }
        }
      }
    } catch (e:any) {
      console.warn('Error removing screenshot from storage:', e?.message || e);
    }

    await sql`DELETE FROM screenshots WHERE id = ${id}`;

    try { await emitSocketEvent('screenshot-deleted', { id, employee_id: rec.employee_id }, { toAdmins: true }); } catch {}

    return ok({ ok: true });
  } catch (e:any) {
    console.error('DELETE /api/screenshots error:', e?.message || e);
    return err('Failed to delete screenshot', 500);
  }
}
