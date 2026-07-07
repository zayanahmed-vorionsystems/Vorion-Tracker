import { createClient } from '@supabase/supabase-js';

// Existing client-side client (uses anon key) — keep whatever you already have here
export const supabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
export function assertSupabaseAdmin() {
  if (!supabaseAdmin) {
    throw new Error(
      'supabaseAdmin is not configured — SUPABASE_SERVICE_ROLE_KEY is missing or empty. ' +
      'Set it in your environment and restart the server.'
    );
  }
  return supabaseAdmin;
}

// Server-side admin client — uses the service role key, bypasses RLS.
// NEVER import this in client components — only in API routes / server code.
export const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )
  : null;

export async function POST(request: NextRequest) {
  try {
    // 🔍 DEBUG — restart ke baad terminal mein ye line check karein
    console.log(
      '[DEBUG] SUPABASE_SERVICE_ROLE_KEY present:',
      Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      '| length:',
      process.env.SUPABASE_SERVICE_ROLE_KEY?.length,
      '| supabaseAdmin exists:',
      Boolean(supabaseAdmin)
    );
    const formData = await request.formData();
    const employeeId = String(formData.get('employeeId') || '');
    const adminId = String(formData.get('adminId') || '');
    const startTime = String(formData.get('startTime') || new Date().toISOString());
    const endTime = String(formData.get('endTime') || new Date().toISOString());
    const duration = Number(formData.get('duration') || 0);
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Recording file is required.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const fileName = `live-${employeeId || 'unknown'}-${Date.now()}.webm`;

    if (supabaseAdmin) {
      const { data, error } = await supabaseAdmin.storage
        .from('live-recordings')
        .upload(fileName, buffer, {
          contentType: file.type || 'video/webm',
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        // 🔍 DEBUG — full error object print karega, RLS ka exact reason pata chalega
        console.error('[live-recordings] Supabase upload failed — FULL ERROR:', JSON.stringify(error, null, 2));
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const { data: signedData } = await supabaseAdmin.storage
        .from('live-recordings')
        .createSignedUrl(data?.path || fileName, 60 * 60 * 24 * 7);

      return NextResponse.json({
        ok: true,
        employeeId,
        adminId,
        startTime,
        endTime,
        duration,
        fileUrl: signedData?.signedUrl || null,
      });
    }

    console.warn('[live-recordings] supabaseAdmin is null — falling back to base64 response. Service role key missing/not loaded.');

    return NextResponse.json({
      ok: true,
      employeeId,
      adminId,
      startTime,
      endTime,
      duration,
      fileUrl: `data:${file.type || 'video/webm'};base64,${buffer.toString('base64')}`,
    });
  } catch (error: any) {
    console.error('[live-recordings] failed', error?.stack || error);
    return NextResponse.json({ error: error?.message || 'Recording upload failed' }, { status: 500 });
  }
}