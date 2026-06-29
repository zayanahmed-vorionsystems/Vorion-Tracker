import { NextRequest } from 'next/server';
import { requireAuth, ok, err } from '@/lib/api';
import { createBlockedApp, deleteBlockedApp, listBlockedApps, updateBlockedApp } from '@/lib/security';

export async function GET(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;

  try {
    const apps = await listBlockedApps(true);
    return ok(apps);
  } catch (e: any) {
    console.error('GET /api/blocked/apps error:', e?.message || e);
    return err('Internal server error', 500);
  }
}

export async function POST(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;
  if (user.role !== 'super_admin') return err('Forbidden', 403);

  try {
    const body = await req.json();
    const app = await createBlockedApp({
      displayName: String(body?.displayName || '').trim(),
      processName: String(body?.processName || '').trim(),
      reason: body?.reason ? String(body.reason) : null,
      enabled: body?.enabled !== undefined ? Boolean(body.enabled) : true,
    });
    return ok(app, 201);
  } catch (e: any) {
    console.error('POST /api/blocked/apps error:', e?.message || e);
    return err(e?.message || 'Internal server error', 500);
  }
}

export async function PUT(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;
  if (user.role !== 'super_admin') return err('Forbidden', 403);

  try {
    const body = await req.json();
    const app = await updateBlockedApp(String(body?.id || ''), {
      displayName: body?.displayName !== undefined ? String(body.displayName).trim() : undefined,
      processName: body?.processName !== undefined ? String(body.processName).trim() : undefined,
      reason: body?.reason !== undefined ? (body.reason ? String(body.reason) : null) : undefined,
      enabled: body?.enabled !== undefined ? Boolean(body.enabled) : undefined,
    });
    if (!app) return err('App not found', 404);
    return ok(app);
  } catch (e: any) {
    console.error('PUT /api/blocked/apps error:', e?.message || e);
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
    const deleted = await deleteBlockedApp(id);
    if (!deleted) return err('App not found', 404);
    return ok({ success: true });
  } catch (e: any) {
    console.error('DELETE /api/blocked/apps error:', e?.message || e);
    return err(e?.message || 'Internal server error', 500);
  }
}
