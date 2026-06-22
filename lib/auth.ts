// lib/auth.ts
import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import type { Role } from './db';

const SECRET = process.env.JWT_SECRET!;

export interface TokenPayload {
  sub: string; role: Role; teamId: string | null; name: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: '8h' });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, SECRET) as TokenPayload;
}

export function getTokenFromRequest(req: NextRequest): TokenPayload | null {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  try { return verifyToken(auth.slice(7)); }
  catch { return null; }
}

// ── Role levels ────────────────────────────────────────────────────────────
const LEVELS: Record<Role, number> = {
  super_admin: 5, executive: 4, qa_manager: 3, team_lead: 2, employee: 1,
};

export const roleLevel    = (r: Role) => LEVELS[r] ?? 0;
export const canMonitorAll = (r: Role) => ['super_admin','qa_manager'].includes(r);
export const canManageUsers= (r: Role) => r === 'super_admin';
export const canSendAlerts = (r: Role) => ['super_admin','qa_manager','team_lead'].includes(r);
export const isAtLeast     = (r: Role, min: Role) => roleLevel(r) >= roleLevel(min);
