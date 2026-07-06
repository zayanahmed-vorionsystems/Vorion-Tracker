// lib/api.ts
import { NextResponse } from 'next/server';
import { getTokenFromRequest } from './auth';
import type { NextRequest } from 'next/server';
import type { TokenPayload } from './auth';

const noStoreHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

export const ok  = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: noStoreHeaders });
export const err = (msg: unknown, status = 400) => {
  if (typeof msg === 'string') return NextResponse.json({ error: msg }, { status, headers: noStoreHeaders });
  return NextResponse.json(msg as any, { status, headers: noStoreHeaders });
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
