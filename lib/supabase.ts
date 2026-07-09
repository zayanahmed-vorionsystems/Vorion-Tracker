import { createClient } from '@supabase/supabase-js';

function isConfiguredValue(value?: string | null) {
  const normalized = String(value || '').trim();
  if (!normalized) return false;
  if (normalized.includes('REPLACE_IN_HOSTING_PROVIDER')) return false;
  if (normalized.includes('placeholder.supabase.co')) return false;
  return true;
}

const publicSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serverSupabaseUrl = process.env.SUPABASE_URL || publicSupabaseUrl;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseClient =
  isConfiguredValue(publicSupabaseUrl) && isConfiguredValue(publicSupabaseAnonKey)
    ? createClient(publicSupabaseUrl!, publicSupabaseAnonKey!)
    : null;

export const supabaseAdmin =
  isConfiguredValue(serverSupabaseUrl) && isConfiguredValue(serviceRoleKey)
    ? createClient(serverSupabaseUrl!, serviceRoleKey!, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null;

export function assertSupabaseAdmin() {
  if (!supabaseAdmin) {
    throw new Error(
      'supabaseAdmin is not configured. Set real SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY values, then restart the server.'
    );
  }
  return supabaseAdmin;
}
