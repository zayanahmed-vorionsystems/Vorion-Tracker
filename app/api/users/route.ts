// app/api/users/route.ts
import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth, requireRole, ok, err } from '@/lib/api';
import { canManageUsers } from '@/lib/auth';
import type { Role } from '@/lib/db';

export async function GET(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;

  const { role, sub } = user;
  let rows;

  if (['super_admin', 'admin', 'qa_manager', 'executive'].includes(role)) {
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
  } else if (role === 'team_lead') {
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
      WHERE p.department_id = (
        SELECT department_id FROM public.profiles WHERE id = ${sub}
      )
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

  return ok(rows);
}

export async function POST(req: NextRequest) {
  const authUser = requireRole(req, 'super_admin', 'admin');
  if ('status' in authUser) return authUser;

  const { name, email: rawEmail, role, departmentId, password } = await req.json();
  const email = String(rawEmail || '').trim().toLowerCase();
  console.log('Create User Request');
  console.log('Auth User:', authUser);
  console.log('Can Manage:', canManageUsers(authUser.role));
  if (!name || !email || !role || !password) {
    return err('name, email, role, and password are required');
  }

  const safeDeptId =
    departmentId && String(departmentId).trim() !== '' ? departmentId : null;

  // 1. Create Supabase Auth user first
  const { data: authData, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError) {
    console.error('Supabase auth create error:', authError);
    if (authError.message?.includes('already registered')) {
      return err('Email already exists in auth', 409);
    }
    return err('Failed to create auth user', 500);
  }

  // 2. Insert into public.profiles using the auth user's UUID
  try {
    const [u] = await sql`
      INSERT INTO public.profiles (id, full_name, email, role, department_id)
      VALUES (
        ${authData.user.id},
        ${name},
        ${email},
        ${role},
        ${safeDeptId}
      )
      RETURNING
        id,
        full_name,
        full_name AS name,
        email,
        role,
        department_id,
        employee_code
    `;
    return ok(u, 201);
  } catch (e: any) {
  console.error('Create profile error:', e);
  await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
  if (e.code === '23505') return err('Email already exists', 409);
  return err(e?.message || 'Failed to create user profile', 500);  // throw ki jagah return
}
}

export async function DELETE(req: NextRequest) {
  const authUser = requireRole(req, 'super_admin', 'admin');
  if ('status' in authUser) return authUser;

  const { id } = await req.json();
  if (!id) return err('User id is required', 400);

  try {
    // 1. Delete related data first (correct table/column names)
    await sql`DELETE FROM app_activity    WHERE employee_id = ${id}`;
    await sql`DELETE FROM website_activity WHERE employee_id = ${id}`;
    await sql`DELETE FROM screenshots     WHERE employee_id = ${id}`;
    await sql`DELETE FROM recordings      WHERE employee_id = ${id}`;
    await sql`DELETE FROM employee_status WHERE employee_id = ${id}`;
    await sql`
      DELETE FROM breaks WHERE attendance_id IN (
        SELECT id FROM attendance WHERE employee_id = ${id}
      )
    `;
    await sql`DELETE FROM attendance WHERE employee_id = ${id}`;

    // 2. Delete profile
    await sql`DELETE FROM public.profiles WHERE id = ${id}`;

    // 3. Delete from Supabase Auth last
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (deleteError) {
      console.error('Supabase auth delete error:', deleteError);
      // Profile already deleted — just log, don't fail
    }

  } catch (e: any) {
    console.error('Delete user error:', e);
    return err(e?.message || 'Failed to delete user', 500);
  }

  return ok({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const authUser = requireAuth(req);
  if ('status' in authUser) return authUser;

  const { id, name, email: rawEmail, role, departmentId, password } = await req.json();
  if (!id) return err('User id is required', 400);

  // Allow if the requester can manage users, or if they're editing their own profile
  const isAdmin = canManageUsers(authUser.role);
  const isSelf = authUser.sub === id;
  if (!isAdmin && !isSelf) return err('Forbidden', 403);

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
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(id, authPayload as any);
    if (authError) {
      console.error('Supabase auth update error:', authError);
      if (authError.message?.includes('already registered')) return err('Email already exists in auth', 409);
      return err('Failed to update auth user', 500);
    }
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