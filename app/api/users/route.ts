// app/api/users/route.ts
import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { assertSupabaseAdmin } from '@/lib/supabase';
import { requireAuth, requireRole, ok, err } from '@/lib/api';
import { canManageUsers } from '@/lib/auth';
import { createEmployeeAccount, deleteUserAndProfile, deriveStatusFromAuthUser, UserServiceError } from '@/lib/user';
import type { Role } from '@/lib/db';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;

  const { role, sub } = user;
  if (['qa_manager', 'team_lead', 'employee'].includes(role)) {
    return err('Forbidden', 403);
  }

  let rows;

  if (['super_admin', 'admin'].includes(role)) {
    rows = await sql`
      SELECT
        p.id,
        p.full_name,
        p.full_name AS name,
        p.email,
        p.role,
        p.department_id,
        p.employee_code,
        p.created_at,
        d.name AS department_name
      FROM public.profiles p
      LEFT JOIN departments d ON d.id = p.department_id
      ORDER BY p.full_name
    `;
  } else {
    rows = await sql`
      SELECT
        id,
        full_name,
        full_name AS name,
        email,
        role,
        department_id,
        employee_code
      FROM public.profiles
      WHERE id = ${sub}
    `;
  }

  // Enrich rows with auth status (Active / Invited / Pending Verification / Disabled).
  //
  // Previously this did one admin.auth.admin.getUserById() call PER ROW inside a
  // try/catch that silently swallowed any error ("ignore per-user errors"), and the
  // outer try/catch silently returned rows with NO status field at all if
  // assertSupabaseAdmin() failed. Either failure mode makes every user look like
  // 'Unknown' in the UI with zero indication of why — which hides real invite
  // status and makes the "Resend invite" button disappear even for users who
  // genuinely are Invited.
  //
  // Fetching all auth users once via listUsers() instead of N individual calls
  // is both more reliable (one call to fail/rate-limit instead of N) and gives
  // us a single place to log what went wrong.
  try {
    const admin = assertSupabaseAdmin();

    const authUsersById = new Map<string, any>();
    let page = 1;
    const perPage = 1000;
    // Paginate in case there are more than 1000 auth users.
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) {
        console.error('[users:GET] listUsers failed', { page, error });
        break;
      }
      const batch = data?.users || [];
      for (const u of batch) {
        authUsersById.set(u.id, u);
      }
      if (batch.length < perPage) break;
      page += 1;
    }

    const enriched = rows.map((r: any) => {
      const authUser = authUsersById.get(r.id);
      if (!authUser) {
        const fallbackStatus = ['super_admin', 'admin', 'qa_manager'].includes(r.role)
          ? 'Invited'
          : 'Pending Verification';
        return { ...r, status: fallbackStatus };
      }
      return { ...r, status: deriveStatusFromAuthUser(authUser) };
    });

    return ok(enriched);
  } catch (e) {
    console.error('[users:GET] Failed to enrich rows with auth status — returning rows with status=Unknown', e);
    return ok(rows.map((r: any) => ({ ...r, status: 'Unknown' })));
  }
}

export async function POST(req: NextRequest) {
  const authUser = requireAuth(req);
  if ('status' in authUser) return authUser;
  if (!['super_admin', 'admin'].includes(authUser.role)) return err('Forbidden', 403);

  let admin;
  try {
    admin = assertSupabaseAdmin();
  } catch (e: any) {
    console.error('[users:POST] Supabase admin unavailable:', e?.message || e);
    return err(e?.message || 'Server misconfigured: Supabase admin unavailable', 500);
  }

  const { name, email: rawEmail, role, departmentId, password } = await req.json();
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!name || !email || !role) {
    return err('name, email and role are required');
  }

  const allowedRoles = ['super_admin', 'admin', 'qa_manager', 'team_lead', 'employee'];
  if (!allowedRoles.includes(role)) {
    return err('Invalid role', 400);
  }

  if (authUser.role === 'admin' && role === 'super_admin') {
    return err('Admins cannot create a super admin account.', 403);
  }

  if (role === 'super_admin') {
    const existingSuperAdmins = await sql`SELECT id FROM public.profiles WHERE role = 'super_admin' LIMIT 1`;
    if (existingSuperAdmins.length > 0) {
      return err('Only one super admin account is allowed.', 403);
    }
  }

  const safeDeptId =
    departmentId && String(departmentId).trim() !== '' ? departmentId : null;

  console.log('[users:POST] create request', { email, role, departmentId: safeDeptId });

  const payload = { name, email, role: role as Role, departmentId: safeDeptId };

  try {
    if (!password || typeof password !== 'string' || password.length < 8) {
      return err('Password must be at least 8 characters', 400);
    }

    // Every role gets an admin-set password + credentials email.
    const { profile, status, emailSent } = await createEmployeeAccount(admin, { ...payload, password });

    return ok({ ...profile, status, emailSent }, 201);
  } catch (e: any) {
    console.error('[users:POST] create error:', e);
    if (e instanceof UserServiceError) return err(e.message, e.status);
    if (String(e?.message || '').toLowerCase().includes('already registered')) return err('User already exists', 409);
    return err(e?.message || 'Failed to create user', 500);
  }
}
export async function DELETE(req: NextRequest) {
  const authUser = requireAuth(req);
  if ('status' in authUser) return authUser;
  if (authUser.role !== 'super_admin') return err('Forbidden', 403);

  let admin;
  try {
    admin = assertSupabaseAdmin();
  } catch (e: any) {
    console.error('[users:DELETE] Supabase admin unavailable:', e?.message || e);
    return err(e?.message || 'Server misconfigured: Supabase admin unavailable', 500);
  }

  const { id } = await req.json();
  if (!id) return err('User id is required', 400);
  if (authUser.sub === id) return err('You cannot delete your own account.', 403);

  const [targetUser] = await sql`SELECT role FROM public.profiles WHERE id = ${id} LIMIT 1`;
  if (targetUser?.role === 'super_admin') {
    return err('The super admin account cannot be deleted.', 403);
  }

  try {
    await deleteUserAndProfile(admin, id);
    return ok({ ok: true });
  } catch (e: any) {
    console.error('[users:DELETE] delete error:', e);
    if (e instanceof UserServiceError) return err(e.message, e.status);
    return err(e?.message || 'Failed to delete user', 500);
  }
}

export async function PATCH(req: NextRequest) {
  const authUser = requireAuth(req);
  if ('status' in authUser) return authUser;

  let admin;
  try {
    admin = assertSupabaseAdmin();
  } catch (e: any) {
    console.error('[users:PATCH] Supabase admin unavailable:', e?.message || e);
    return err(e?.message || 'Server misconfigured: Supabase admin unavailable', 500);
  }

  const body = await req.json();
  const { id, name, email: rawEmail, role, departmentId, password, disabled } = body;
  if (!id) return err('User id is required', 400);

  // Allow if the requester can manage users, or if they're editing their own profile
  const isAdmin = canManageUsers(authUser.role);
  const isSelf = authUser.sub === id;
  if (!isAdmin && !isSelf) return err('Forbidden', 403);
  if (authUser.role === 'admin') {
    const [targetUser] = await sql`SELECT role FROM public.profiles WHERE id = ${id} LIMIT 1`;
    if (targetUser?.role === 'super_admin') return err('Admins cannot modify a super admin account.', 403);
  }

  if (role !== undefined) {
    if (authUser.role === 'admin' && role === 'super_admin') {
      return err('Admins cannot create a super admin account.', 403);
    }

    if (role === 'super_admin') {
      const existingSuperAdmins = await sql`SELECT id FROM public.profiles WHERE role = 'super_admin' AND id != ${id} LIMIT 1`;
      if (existingSuperAdmins.length > 0) {
        return err('Only one super admin account is allowed.', 403);
      }
    }
  }

  const email = rawEmail === undefined ? undefined : String(rawEmail || '').trim().toLowerCase();
  const safeDeptId =
    departmentId === undefined
      ? undefined
      : departmentId && String(departmentId).trim() !== ''
      ? departmentId
      : null;

  if (!isAdmin && role !== undefined) return err('Forbidden', 403);
  if (!isAdmin && departmentId !== undefined) return err('Forbidden', 403);

  const authPayload: Record<string, unknown> = {};
  if (email !== undefined) authPayload.email = email;
  if (password !== undefined && password !== '') {
    if (typeof password !== 'string') return err('Password must be a string', 400);
    if (password.length < 8) return err('Password must be at least 8 characters', 400);
    authPayload.password = password;
  }

  if (Object.keys(authPayload).length > 0) {
    // Validate password complexity server-side to avoid Supabase throwing AuthWeakPasswordError
    if (authPayload.password) {
      const pw = String(authPayload.password);
      const complexity = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=[\]{};':"\\|<>,./?`~])/;
      if (!complexity.test(pw)) {
        return err(
          'Password must include at least one lowercase letter, one uppercase letter, one digit, and one special character',
          400
        );
      }
    }

    try {
      const { error: authError } = await admin.auth.admin.updateUserById(id, authPayload as any);
      if (authError) {
        console.error('Supabase auth update error:', authError);
        if (authError.message?.includes('already registered')) return err('Email already exists in auth', 409);
        if (authError.message?.toLowerCase().includes('password') || authError.name === 'AuthWeakPasswordError') {
          return err(authError.message || 'Password does not meet complexity requirements', 400);
        }
        return err('Failed to update auth user', 500);
      }
    } catch (e: any) {
      console.error('Supabase auth update exception:', e);
      if (String(e?.message || '').toLowerCase().includes('password')) {
        return err(String(e.message), 400);
      }
      return err('Failed to update auth user', 500);
    }
  }

  // If disabling/enabling, call Supabase admin API
  //
  // NOTE: this reuses `email_confirm` as a disable flag (email_confirm: !disabled).
  // Be aware that toggling this ON (i.e. "enabling" a user) also marks their email
  // as confirmed, which will flip an Invited user straight to Active even if they
  // never actually clicked their invite link and set a password. If you only ever
  // call this for genuinely-active users being re-enabled, this is fine — but don't
  // wire "enable" up to invited-but-not-yet-confirmed users expecting it to be a
  // no-op on their invite status.
  if (typeof disabled === 'boolean') {
    try {
      const { error } = await admin.auth.admin.updateUserById(id, { email_confirm: !disabled });
      if (error) console.error('Failed to update disabled flag on auth user:', error);
    } catch (e) { console.error('Failed to update disabled flag', e); }
  }

  try {
    await sql`
      UPDATE public.profiles
      SET
        full_name     = COALESCE(${name},            full_name),
        email         = COALESCE(${email},           email),
        role          = COALESCE(${role as Role},    role),
        department_id = COALESCE(${safeDeptId},      department_id),
        updated_at    = NOW()
      WHERE id = ${id}
    `;
  } catch (e: any) {
    console.error('Update profile error:', e);
    if (e.code === '23505') return err('Email already exists', 409);
    return err('Failed to update user profile', 500);
  }

  return ok({ ok: true });
}