import { NextRequest } from 'next/server';
import { requireAuth, ok, err } from '@/lib/api';
import { createBlockedWebsite, deleteBlockedWebsite, listBlockedWebsites, updateBlockedWebsite } from '@/lib/security';

export async function GET(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;

  try {
    const sites = await listBlockedWebsites(true);
    return ok(sites);
  } catch (e: any) {
    console.error('GET /api/blocked/websites error:', e?.message || e);
    return err('Internal server error', 500);
  }
}

export async function POST(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;
  if (user.role !== 'super_admin') return err('Forbidden', 403);

  try {
    const body = await req.json();
    const site = await createBlockedWebsite({
      domain: String(body?.domain || '').trim(),
      reason: body?.reason ? String(body.reason) : null,
      enabled: body?.enabled !== undefined ? Boolean(body.enabled) : true,
    });
    return ok(site, 201);
  } catch (e: any) {
    console.error('POST /api/blocked/websites error:', e?.message || e);
    return err(e?.message || 'Internal server error', 500);
  }
}

export async function PUT(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;
  if (user.role !== 'super_admin') return err('Forbidden', 403);

  try {
    const body = await req.json();
    const site = await updateBlockedWebsite(String(body?.id || ''), {
      domain: body?.domain !== undefined ? String(body.domain).trim() : undefined,
      reason: body?.reason !== undefined ? (body.reason ? String(body.reason) : null) : undefined,
      enabled: body?.enabled !== undefined ? Boolean(body.enabled) : undefined,
    });
    if (!site) return err('Website not found', 404);
    return ok(site);
  } catch (e: any) {
    console.error('PUT /api/blocked/websites error:', e?.message || e);
    return err(e?.message || 'Internal server error', 500);
  }
}

export async function DELETE(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;
  if (user.role !== 'super_admin') return err('Forbidden', 403);

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return err('id is required', 400);
    const deleted = await deleteBlockedWebsite(id);
    if (!deleted) return err('Website not found', 404);
    return ok({ success: true });
  } catch (e: any) {
    console.error('DELETE /api/blocked/websites error:', e?.message || e);
    return err(e?.message || 'Internal server error', 500);
  }
}
