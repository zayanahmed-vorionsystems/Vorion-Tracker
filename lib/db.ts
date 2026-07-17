// lib/db.ts
import { Pool, PoolClient } from 'pg';
import type { Role, ShiftType } from './roles';

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1)
    : trimmed;
}

const rawDatabaseUrl = process.env.DATABASE_URL ?? '';
const connectionString = rawDatabaseUrl ? stripQuotes(rawDatabaseUrl) : '';

let pool: Pool | null = null;

if (connectionString) {
  try {
    pool = new Pool({
      connectionString,
      // Supabase's pgbouncer pooler (port 6543, transaction mode) already
      // pools connections upstream. Keep this side small so we never queue
      // more work than pgbouncer is willing to accept from one client.
      max: 8,
      // Fail fast instead of hanging 30-50s when the pool is exhausted or
      // the network path (Peshawar -> Seoul) is slow. This turns silent
      // 50s+ stalls into a quick, retryable error.
      connectionTimeoutMillis: 8_000,
      // Release idle connections back so pgbouncer doesn't see a pile of
      // long-lived idle clients from this process.
      idleTimeoutMillis: 20_000,
      // Supabase's pooler requires TLS; without this, some environments
      // silently fall back to a slower/rejected negotiation path.
      ssl: { rejectUnauthorized: false },
    });

    pool.on('error', (err) => {
      // Prevents an idle-client network error from crashing the whole
      // process via an unhandled 'error' event (this is a known pg gotcha).
      console.error('[DB] Unexpected idle client error:', err.message);
    });
  } catch (error) {
    console.error('Failed to parse DATABASE_URL:', error);
    throw error;
  }
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
  if (!pool) throw new Error('DATABASE_URL environment variable is not set');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Transaction rollback failed:', rollbackError);
    }
    throw error;
  } finally {
    client.release();
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
// Matches public.profiles exactly
export interface User {
  id:            string;
  email:         string;
  full_name:     string;        // was: name
  role:          Role;
  department_id: string | null; // was: team_id
  employee_code: string | null;
  shift_type?:   ShiftType | null;
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