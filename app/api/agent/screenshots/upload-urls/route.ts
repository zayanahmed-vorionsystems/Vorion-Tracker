import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { requireAuth, ok, err } from '@/lib/api';
import { assertSupabaseAdmin } from '@/lib/supabase';

const MAX_BATCH_SIZE = 30;
const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/webp': 'webp',
};

function normalizeRequestItems(body: any) {
  if (Array.isArray(body?.screenshots)) return body.screenshots;

  const requested = Number(body?.count);
  const count = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), MAX_BATCH_SIZE) : 1;
  return Array.from({ length: count }, () => ({ contentType: 'image/png', ext: 'png' }));
}

// URLs expire quickly and are restricted to a new object under the authenticated
// employee's prefix. Image bytes therefore never pass through Vercel.
export async function POST(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;
  try {
    const body = await req.json().catch(() => ({}));
    const requestedItems = normalizeRequestItems(body);
    if (requestedItems.length < 1 || requestedItems.length > MAX_BATCH_SIZE) return err('screenshots must contain 1 to 30 items', 400);

    const items = [];
    for (const item of requestedItems) {
      const contentType = String(item?.contentType || 'image/png').trim().toLowerCase();
      const ext = ALLOWED_TYPES[contentType];
      if (!ext) return err('Only PNG or WebP screenshots are accepted', 400);
      items.push({ contentType, ext });
    }

    const storage = assertSupabaseAdmin().storage.from('screenshots');
    const uploads = await Promise.all(items.map(async (item) => {
      const path = `screenshots/${user.sub}/${Date.now()}-${randomUUID()}.${item.ext}`;
      const { data, error } = await storage.createSignedUploadUrl(path);
      if (error || !data?.signedUrl) throw error || new Error('Could not create upload URL');
      return { path, signedUrl: data.signedUrl, token: data.token, contentType: item.contentType };
    }));
    return ok({ uploads });
  } catch (error: any) {
    console.error('POST /api/agent/screenshots/upload-urls error:', error?.message || error);
    return err('Could not prepare screenshot upload', 500);
  }
}
