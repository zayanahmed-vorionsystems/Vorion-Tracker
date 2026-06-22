// app/api/auth/route.ts
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql } from '@/lib/db';
import { signToken } from '@/lib/auth';
import { ok, err } from '@/lib/api';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) return err('Email and password required');

    const [user] = await sql`
      SELECT id, name, email, password, role, team_id
      FROM users WHERE email = ${email} AND is_active = true
    `;
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return err('Invalid credentials', 401);
    }

    const token = signToken({
      sub:    user.id,
      role:   user.role,
      teamId: user.team_id,
      name:   user.name,
    });

    return ok({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, teamId: user.team_id },
    });
  } catch (e) {
    console.error('Auth error:', e);
    return err('Server error — check server console for details', 500);
  }
}
