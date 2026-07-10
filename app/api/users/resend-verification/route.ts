import { NextRequest } from 'next/server';
import { requireRole, err, ok } from '@/lib/api';
import { assertSupabaseAdmin } from '@/lib/supabase';
import { resendVerification, UserServiceError } from '@/lib/user';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: NextRequest) {
  const authUser = requireRole(req, 'super_admin', 'admin');
  if ('status' in authUser) return authUser;

  let admin;
  try { admin = assertSupabaseAdmin(); } catch (e: any) { return err('Supabase admin unavailable', 500); }

  const { email } = await req.json();
  if (!email) return err('email is required', 400);

  try {
    const data = await resendVerification(admin, email);
    return ok({ ok: true, data });
  } catch (e: any) {
    console.error('[resend-verification] error', e);
    if (e instanceof UserServiceError) return err(e.message, e.status);
    return err(e?.message || 'Failed to resend verification', 500);
  }
}
