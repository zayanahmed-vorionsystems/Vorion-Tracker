// app/api/users/route.ts
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql } from '@/lib/db';
import { requireAuth, requireRole, ok, err } from '@/lib/api';
import type { Role } from '@/lib/db';

export async function GET(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;

  const { role, sub } = user;

  let rows;

  if (['super_admin', 'qa_manager', 'executive'].includes(role)) {
    rows = await sql`
      SELECT
        u.id,
        u.name,
        u.email,
        u.role,
        u.team_id,
        u.is_active,
        u.created_at,
        t.name AS team_name
      FROM users u
      LEFT JOIN teams t ON t.id = u.team_id
      ORDER BY u.name
    `;
  } else if (role === 'team_lead') {
    rows = await sql`
      SELECT
        u.id,
        u.name,
        u.email,
        u.role,
        u.team_id,
        u.is_active,
        u.created_at,
        t.name AS team_name
      FROM users u
      LEFT JOIN teams t ON t.id = u.team_id
      WHERE u.team_id = (
        SELECT team_id
        FROM users
        WHERE id = ${sub}
      )
      ORDER BY u.name
    `;
  } else {
    rows = await sql`
      SELECT id, name, email, role, team_id
      FROM users
      WHERE id = ${sub}
    `;
  }

  return ok(rows);
}

export async function POST(req: NextRequest) {
  const authUser = requireRole(req, 'super_admin');
  if ('status' in authUser) return authUser;

  const { name, email, password, role, teamId } = await req.json();

  if (!name || !email || !password || !role) {
    return err('name, email, password, role required');
  }

  // Convert empty string to NULL
  const safeTeamId =
    teamId && String(teamId).trim() !== ''
      ? teamId
      : null;

  console.log('Creating user:', {
    name,
    email,
    role,
    teamId,
    safeTeamId
  });

  const hash = bcrypt.hashSync(password, 10);

  try {
    const [u] = await sql`
      INSERT INTO users (
        name,
        email,
        password,
        role,
        team_id
      )
      VALUES (
        ${name},
        ${email},
        ${hash},
        ${role},
        ${safeTeamId}
      )
      RETURNING
        id,
        name,
        email,
        role,
        team_id
    `;

    return ok(u, 201);
  } catch (e: any) {
    console.error('Create user error:', e);

    if (
      e.message?.includes('unique') ||
      e.code === '23505'
    ) {
      return err('Email already exists', 409);
    }

    throw e;
  }
}

export async function PATCH(req: NextRequest) {
  const authUser = requireRole(req, 'super_admin');
  if ('status' in authUser) return authUser;

  const {
    id,
    name,
    email,
    role,
    teamId,
    isActive
  } = await req.json();

  const safeTeamId =
    teamId === undefined
      ? undefined
      : teamId && String(teamId).trim() !== ''
      ? teamId
      : null;

  await sql`
    UPDATE users
    SET
      name = COALESCE(${name}, name),
      email = COALESCE(${email}, email),
      role = COALESCE(${role as Role}, role),
      team_id = COALESCE(${safeTeamId}, team_id),
      is_active = COALESCE(${isActive}, is_active),
      updated_at = NOW()
    WHERE id = ${id}
  `;

  return ok({ ok: true });
}