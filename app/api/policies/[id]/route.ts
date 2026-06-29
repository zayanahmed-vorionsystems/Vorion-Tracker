import { NextRequest } from 'next/server';
import { requireAuth, ok, err } from '@/lib/api';
import { updatePolicySettings } from '@/lib/security';

export async function PUT(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;
  if (user.role !== 'super_admin') return err('Forbidden', 403);

  try {
    const body = await req.json();
    const policy = await updatePolicySettings({
      blockWebsites: body?.blockWebsites !== undefined ? Boolean(body.blockWebsites) : undefined,
      blockApps: body?.blockApps !== undefined ? Boolean(body.blockApps) : undefined,
      showWarning: body?.showWarning !== undefined ? Boolean(body.showWarning) : undefined,
      killProcess: body?.killProcess !== undefined ? Boolean(body.killProcess) : undefined,
    });
    return ok(policy);
  } catch (e: any) {
    console.error('PUT /api/policies error:', e?.message || e);
    return err(e?.message || 'Internal server error', 500);
  }
}
