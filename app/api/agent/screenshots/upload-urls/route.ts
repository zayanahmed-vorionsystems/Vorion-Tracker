import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { requireAuth, ok, err } from '@/lib/api';
import { assertSupabaseAdmin } from '@/lib/supabase';

const MAX_BATCH_SIZE = 30;

// URLs expire quickly and are restricted to a new object under the authenticated
// employee's prefix. Image bytes therefore never pass through Vercel.
export async function POST(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;
  try {
    const requested = Number((await req.json().catch(() => ({})))?.count);
    const count = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), MAX_BATCH_SIZE) : 1;
    const storage = assertSupabaseAdmin().storage.from('screenshots');
    const uploads = await Promise.all(Array.from({ length: count }, async () => {
      const path = `screenshots/${user.sub}/${Date.now()}-${randomUUID()}.png`;
      const { data, error } = await storage.createSignedUploadUrl(path);
      if (error || !data?.signedUrl) throw error || new Error('Could not create upload URL');
      return { path, signedUrl: data.signedUrl };
    }));
    return ok({ uploads });
  } catch (error: any) {
    console.error('POST /api/agent/screenshots/upload-urls error:', error?.message || error);
    return err('Could not prepare screenshot upload', 500);
  }
}
