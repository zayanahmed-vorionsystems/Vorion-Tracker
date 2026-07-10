import { NextRequest } from 'next/server';
import { assertSupabaseAdmin } from '@/lib/supabase';
import { sql } from '@/lib/db';
import { requireRole, ok, err } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  // require a privileged role to run diagnostics
  const auth = requireRole(req, 'super_admin', 'admin');
  if ('status' in auth) return auth;

  let admin;
  try {
    admin = assertSupabaseAdmin();
  } catch (e: any) {
    return err('Supabase admin unavailable: ' + (e?.message || e), 500);
  }

  const url = new URL(req.url);
  const email = (url.searchParams.get('email') || '').trim().toLowerCase();
  if (!email) return err('Provide ?email= to inspect', 400);

  try {
    const envInfo = {
      supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || null,
      appUrl: process.env.NEXT_PUBLIC_APP_URL || null,
      serviceRoleConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    };

    // Attempt to find auth user via admin.listUsers and match by email
    const { data: listData, error: listError } = await (admin.auth.admin as any).listUsers();
    if (listError) throw listError;
    const found = (listData?.users || []).find((u: any) => String(u.email || '').toLowerCase() === email);

    // Query profile
    const [profile] = await sql`
      SELECT id, full_name, email, role, department_id, created_at
      FROM public.profiles
      WHERE lower(email) = ${email}
    `;

    return ok({ ok: true, email, envInfo, authUser: found || null, profile: profile || null });
  } catch (e: any) {
    console.error('[diagnostics] error', e);
    return err(e?.message || 'Diagnostics failed', 500);
  }
}
