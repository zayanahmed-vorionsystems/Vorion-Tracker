// lib/api.ts
import { NextResponse } from 'next/server';
import { getTokenFromRequest } from './auth';
import type { NextRequest } from 'next/server';
import type { TokenPayload } from './auth';

export const ok  = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const err = (msg: unknown, status = 400) => {
  if (typeof msg === 'string') return NextResponse.json({ error: msg }, { status });
  return NextResponse.json(msg as any, { status });
};

export function requireAuth(req: NextRequest): TokenPayload | NextResponse {
  const user = getTokenFromRequest(req);
  if (!user) return err('Unauthorized', 401);
  return user;
}

export function requireRole(req: NextRequest, ...roles: string[]): TokenPayload | NextResponse {
  const user = getTokenFromRequest(req);
  if (!user) return err('Unauthorized', 401);
  if (!roles.includes(user.role)) return err('Forbidden', 403);
  return user;
}
