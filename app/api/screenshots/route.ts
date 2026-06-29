// app/api/screenshots/route.ts
import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { requireAuth, ok, err } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase';
import { emitSocketEvent } from '@/lib/socket';

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

    const arrayBuffer = await file.arrayBuffer();
    const buffer      = Buffer.from(arrayBuffer);
    const filePath    = `screenshots/${user.sub}/${Date.now()}.png`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('screenshots')
      .upload(filePath, buffer, { contentType: file.type || 'image/png' });

    if (uploadError) {
      console.error('Supabase upload error', uploadError);
      return err('Failed to upload screenshot', 500);
    }

    const publicUrl = supabaseAdmin.storage.from('screenshots').getPublicUrl(filePath).data?.publicUrl || '';

    const [ss] = await sql`
      INSERT INTO screenshots (employee_id, file_url, captured_at, active_app, activity_pct, session_id)
      VALUES (${user.sub}, ${publicUrl}, ${capturedAt}, ${activeApp}, ${actPct}, ${sessionId})
      RETURNING id
    `;

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
  const { role, sub } = user;

  try {
    const { searchParams } = new URL(req.url);
    const filterUserId = searchParams.get('userId');
    const date         = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
    const limit        = parseInt(searchParams.get('limit') || '60');

    let rows;

    if (role === 'employee') {
      rows = await sql`
        SELECT s.id, s.employee_id, s.file_url, s.captured_at, s.created_at, p.full_name AS user_name
        FROM screenshots s
        JOIN public.profiles p ON p.id = s.employee_id
        WHERE s.employee_id = ${sub}
          AND DATE(s.captured_at) = ${date}
        ORDER BY s.captured_at DESC
        LIMIT ${limit}
      `;
    } else if (role === 'team_lead') {
      rows = await sql`
        SELECT s.id, s.employee_id, s.file_url, s.captured_at, s.created_at, p.full_name AS user_name
        FROM screenshots s
        JOIN public.profiles p ON p.id = s.employee_id
        WHERE p.department_id = (
          SELECT department_id FROM public.profiles WHERE id = ${sub}
        )
          AND DATE(s.captured_at) = ${date}
        ORDER BY s.captured_at DESC
        LIMIT ${limit}
      `;
    } else if (filterUserId) {
      rows = await sql`
        SELECT s.id, s.employee_id, s.file_url, s.captured_at, s.created_at, p.full_name AS user_name
        FROM screenshots s
        JOIN public.profiles p ON p.id = s.employee_id
        WHERE s.employee_id = ${filterUserId}
          AND DATE(s.captured_at) = ${date}
        ORDER BY s.captured_at DESC
        LIMIT ${limit}
      `;
    } else {
      rows = await sql`
        SELECT s.id, s.employee_id, s.file_url, s.captured_at, s.created_at, p.full_name AS user_name
        FROM screenshots s
        JOIN public.profiles p ON p.id = s.employee_id
        WHERE DATE(s.captured_at) = ${date}
        ORDER BY s.captured_at DESC
        LIMIT ${limit}
      `;
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
  if (!['super_admin', 'admin'].includes(authUser.role)) return err('Forbidden', 403);

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
    const rows = await sql`SELECT id, employee_id, file_url FROM screenshots WHERE id = ${id} LIMIT 1`;
    const rec = rows?.[0];
    if (!rec) return err('Screenshot not found', 404);

    try {
      const fileUrl: string = rec.file_url || '';
      const m = fileUrl.match(/screenshots\/(.*)$/);
      if (m && m[1]) {
        const objectPath = `screenshots/${m[1]}`;
        const { error: removeErr } = await supabaseAdmin.storage.from('screenshots').remove([objectPath]);
        if (removeErr) console.warn('Failed to remove screenshot from storage', removeErr);
      }
    } catch (e:any) {
      console.warn('Error removing file from storage:', e?.message || e);
    }

    await sql`DELETE FROM screenshots WHERE id = ${id}`;

    try { await emitSocketEvent('screenshot-deleted', { id, employee_id: rec.employee_id }, { toAdmins: true }); } catch {}

    return ok({ ok: true });
  } catch (e:any) {
    console.error('DELETE /api/screenshots error:', e?.message || e);
    return err('Failed to delete screenshot', 500);
  }
}
