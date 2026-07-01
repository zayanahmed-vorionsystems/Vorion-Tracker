import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL              = process.env.NEXT_PUBLIC_SUPABASE_URL      ?? '';
const SUPABASE_ANON_KEY         = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY     ?? '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase client missing required environment variables.');
}

// Placeholder values so createClient() never throws at import/build time.
// Real requests will fail cleanly at call-time instead of crashing the build.
const SAFE_URL = SUPABASE_URL || 'https://placeholder.supabase.co';
const SAFE_ANON_KEY = SUPABASE_ANON_KEY || 'placeholder-anon-key';

// ✅ Browser-safe — uses ANON key (NEXT_PUBLIC_*)
export const supabaseClient = createClient(SAFE_URL, SAFE_ANON_KEY, {
  auth: { persistSession: false, storage: undefined },
});

// ✅ Server-only — only created when SERVICE_ROLE_KEY exists
// ❌ Never import this in any 'use client' file
export const supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SAFE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, storage: undefined },
    })
  : (null as any);

export function assertSupabaseAdmin() {
  if (!SUPABASE_SERVICE_ROLE_KEY || !supabaseAdmin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  }
  return supabaseAdmin;
}