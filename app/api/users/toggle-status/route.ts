import { NextRequest } from 'next/server';
import { requireRole, err, ok } from '@/lib/api';
import { assertSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: NextRequest) {
  const authUser = requireRole(req, 'superadmin', 'admin');
  if ('status' in authUser) return authUser;

  let admin;
  try { admin = assertSupabaseAdmin(); } catch (e: any) { return err('Supabase admin unavailable', 500); }

  const { id, disable } = await req.json();
  if (!id) return err('id is required', 400);

  try {
    const payload: any = {
      user_metadata: {
        banned: Boolean(disable),
      },
    };

    if (typeof admin.auth.admin.updateUserById === 'function') {
      const { error } = await admin.auth.admin.updateUserById(id, payload as any);
      if (error) throw error;
    }

    return ok({ ok: true, disabled: Boolean(disable) });
  } catch (e: any) {
    console.error('[toggle-status] error', e);
    return err(e?.message || 'Failed to toggle status', 500);
  }
}
