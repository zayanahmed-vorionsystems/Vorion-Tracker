import { NextRequest } from 'next/server';
import { requireAuth, ok, err } from '@/lib/api';
import { getPolicySettings } from '@/lib/security';

export async function GET(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;

  try {
    const policy = await getPolicySettings();
    return ok({
      blockApps: policy.blockApps,
      blockWebsites: policy.blockWebsites,
      killProcess: policy.killProcess,
      showWarning: policy.showWarning,
      updatedAt: policy.updatedAt,
    });
  } catch (e: any) {
    console.error('GET /api/security/policies error:', e?.message || e);
    return err('Internal server error', 500);
  }
}
