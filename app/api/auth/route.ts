import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { assertSupabaseAdmin } from '@/lib/supabase';
import { signToken } from '@/lib/auth';
import { requireAuth, ok, err } from '@/lib/api';

// This route depends on runtime env/DB state — never statically evaluate it.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;

  try {
    const rows = await sql`
      SELECT id, email, full_name, role, department_id, employee_code
      FROM public.profiles
      WHERE id = ${user.sub}
      LIMIT 1
    `;

    const profile = rows?.[0];
    if (!profile) return err('Profile not found', 404);

    return ok({
      user: {
        id:            profile.id,
        email:         profile.email,
        full_name:     profile.full_name,
        role:          profile.role,
        department_id: profile.department_id,
        employee_code: profile.employee_code,
        name:          profile.full_name,
      },
    });
  } catch (e: any) {
    console.error('GET /api/auth error:', e?.message || e);
    return err('Service unavailable: database error', 503);
  }
}

export async function POST(req: NextRequest) {
  let admin;
  try {
    admin = assertSupabaseAdmin();
  } catch (e: any) {
    console.error('POST /api/auth config error:', e?.message || e);
    return err('Service unavailable: auth not configured', 503);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return err('Invalid JSON payload', 400);
  }

  const { email: rawEmail, password } = body;
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!email || !password) return err('Email and password required');

  // 1. Verify credentials via Supabase Auth
  const { data: authData, error: authError } =
    await admin.auth.signInWithPassword({ email, password });

  if (authError || !authData?.user) {
    return err('Invalid credentials', 401);
  }

  // 2. Fetch profile from public.profiles
  let profile;
  try {
    const rows = await sql`
      SELECT id, email, full_name, role, department_id, employee_code
      FROM public.profiles
      WHERE LOWER(email) = ${email}
      LIMIT 1
    `;
    profile = rows?.[0];
  } catch (e: any) {
    console.error('Database query failed in /api/auth:', e?.message || e);
    return err('Service unavailable: database error', 503);
  }

  if (!profile) return err('Profile not found', 404);

  const token = signToken({
    sub:    profile.id,
    role:   profile.role,
    name:   profile.full_name,   // keep 'name' in JWT payload for compatibility
    teamId: profile.department_id,
  });

  return ok({
    token,
    user: {
      id:            profile.id,
      email:         profile.email,
      full_name:     profile.full_name,
      role:          profile.role,
      department_id: profile.department_id,
      employee_code: profile.employee_code,
      name:          profile.full_name,
    },
  });
}