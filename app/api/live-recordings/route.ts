import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase';
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

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const fileName = `live-${employeeId || 'unknown'}-${Date.now()}.webm`;

    if (supabaseAdmin) {
  const { data, error } = await supabaseAdmin.storage
    .from('live-recordings')
    .upload(fileName, buffer, {
      contentType: file.type || 'video/webm',
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    console.error('[live-recordings] Supabase upload failed', error);
    return err(error.message, 500);
  }

  const { data: signedData } = await supabaseAdmin.storage
    .from('live-recordings')
    .createSignedUrl(data?.path || fileName, 60 * 60);

  return ok({
    ok: true,
    employeeId,
    adminId: user.sub,
    startTime,
    endTime,
    duration,
    fileUrl: signedData?.signedUrl || null,
  });
}

    return ok({
      ok: true,
      employeeId,
      adminId: user.sub,
      startTime,
      endTime,
      duration,
      fileUrl: `data:${file.type || 'video/webm'};base64,${buffer.toString('base64')}`,
    });
  } catch (error: any) {
    console.error('[live-recordings] failed', error?.stack || error);
    return err(error?.message || 'Recording upload failed', 500);
  }
}
