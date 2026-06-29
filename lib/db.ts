// lib/db.ts
import { Pool } from 'pg';

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1)
    : trimmed;
}

const rawDatabaseUrl = process.env.DATABASE_URL ?? '';
const connectionString = rawDatabaseUrl ? stripQuotes(rawDatabaseUrl) : '';
console.log('DATABASE_URL present:', !!connectionString);
console.log('SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL || 'NOT SET');

let pool: Pool | null = null;

if (connectionString) {
  try {
    pool = new Pool({ connectionString });
  } catch (error) {
    console.error('Failed to parse DATABASE_URL:', error);
    throw error;
  }
}

export const sql: any = async (strings: TemplateStringsArray, ...values: any[]) => {
  if (!pool) throw new Error('DATABASE_URL environment variable is not set');
  const text = strings.reduce(
    (acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ''),
    ''
  );
  const res = await pool.query(text, values);
  return res.rows;
};

// ── Type helpers ──────────────────────────────────────────────────────────
export type Role =
  | 'super_admin'
  | 'admin'
  | 'executive'
  | 'qa_manager'
  | 'team_lead'
  | 'employee';

// Matches public.profiles exactly
export interface User {
  id:            string;
  email:         string;
  full_name:     string;        // was: name
  role:          Role;
  department_id: string | null; // was: team_id
  employee_code: string | null;
  created_at:    string;
  updated_at:    string;
}

export interface Screenshot {
  id:           string;
  user_id:      string;
  session_id:   string | null;
  file_url:     string;
  active_app:   string | null;
  activity_pct: number;
  captured_at:  string;
  user_name?:   string;
}

export interface Session {
  id:         string;
  user_id:    string;
  started_at: string;
  ended_at:   string | null;
  duration_s: number | null;
  notes:      string | null;
  user_name?: string;
}