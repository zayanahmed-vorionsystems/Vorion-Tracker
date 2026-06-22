// lib/db.ts
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

export const sql = neon(process.env.DATABASE_URL);

// ── Type helpers ─────────────────────────────────────────────────────────
export type Role = 'super_admin' | 'executive' | 'qa_manager' | 'team_lead' | 'employee';

export interface User {
  id: string; name: string; email: string; role: Role;
  team_id: string | null; is_active: boolean; created_at: string;
}

export interface Screenshot {
  id: string; user_id: string; session_id: string | null;
  file_url: string; active_app: string | null;
  activity_pct: number; captured_at: string;
  user_name?: string;
}

export interface Session {
  id: string; user_id: string; started_at: string;
  ended_at: string | null; duration_s: number | null;
  notes: string | null; user_name?: string;
}
