import { createClient } from '@supabase/supabase-js';

// Existing client-side client (uses anon key) — keep whatever you already have here
export const supabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

export function assertSupabaseAdmin() {
  if (!supabaseAdmin) {
    throw new Error(
      'supabaseAdmin is not configured — SUPABASE_SERVICE_ROLE_KEY is missing or empty. ' +
      'Set it in your environment and restart the server.'
    );
  }
  return supabaseAdmin;
}