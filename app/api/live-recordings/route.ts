import { NextRequest } from 'next/server';
import { put } from '@vercel/blob';
import { sql } from '@/lib/db';
import { requireAuth, ok, err } from '@/lib/api';
import { canAccessLiveMonitor, normalizeRole } from '@/lib/roles';

const MAX_RECORDING_BYTES = 100 * 1024 * 1024;

function isAllowedRecordingType(type: string) {
  const normalized = String(type || '').trim().toLowerCase().replace(/\s+/g, '');
  return normalized === 'video/webm' || normalized.startsWith('video/webm;codecs=');
}

async function canManageLiveRecording(user: any, employeeId: string) {
  if (!canAccessLiveMonitor(normalizeRole(user.role))) return false;
  const rows = await sql`
    SELECT 1
    FROM public.profiles employee
    WHERE employee.id = ${employeeId}
      AND employee.role = 'employee'
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function POST(request: NextRequest) {
  const user = requireAuth(request);
  if ('status' in user) return user;

  try {
    if (request.headers.get('content-type')?.includes('application/json')) {
      const body = await request.json();
      const employeeId = String(body?.employeeId || '');
      if (!employeeId) return err('Employee id is required.', 400);
      if (!(await canManageLiveRecording(user, employeeId))) return err('Forbidden', 403);

      const fileUrl = String(body?.fileUrl || '');
      if (!/^https:\/\/.+\.blob\.vercel-storage\.com\//i.test(fileUrl)) return err('Invalid recording URL.', 400);

      return ok({
        ok: true,
        employeeId,
        adminId: user.sub,
        startTime: String(body?.startTime || new Date().toISOString()),
        endTime: String(body?.endTime || new Date().toISOString()),
        duration: Number(body?.duration || 0),
        fileUrl,
      });
    }

    const formData = await request.formData();
    const employeeId = String(formData.get('employeeId') || '');
    const startTime = String(formData.get('startTime') || new Date().toISOString());
    const endTime = String(formData.get('endTime') || new Date().toISOString());
    const duration = Number(formData.get('duration') || 0);
    const file = formData.get('file');

    if (!employeeId) {
      return err('Employee id is required.', 400);
    }
    if (!(await canManageLiveRecording(user, employeeId))) {
      return err('Forbidden', 403);
    }
    if (!file || typeof file === 'string') {
      return err('Recording file is required.', 400);
    }
    if (file.size <= 0) {
      return err('Recording file is empty.', 400);
    }
    if (file.size > MAX_RECORDING_BYTES) {
      return err('Recording file is too large.', 413);
    }
    if (!isAllowedRecordingType(file.type || '')) {
      console.error('[live-recordings] unsupported file type', { type: file.type, size: file.size });
      return err('Unsupported recording file type.', 400);
    }

    const fileName = `live-recordings/${employeeId || 'unknown'}/live-${Date.now()}.webm`;
    const blob = await put(fileName, file, {
      access: 'public',
      contentType: file.type || 'video/webm',
      addRandomSuffix: false,
      multipart: true,
    });

    return ok({
      ok: true,
      employeeId,
      adminId: user.sub,
      startTime,
      endTime,
      duration,
      fileUrl: blob.url,
    });
  } catch (error: any) {
    console.error('[live-recordings] failed', error?.stack || error);
    return err(error?.message || 'Recording upload failed', 500);
  }
}
