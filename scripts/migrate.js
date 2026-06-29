// scripts/migrate.js
// Run: node scripts/migrate.js
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  console.log('Running migrations on Postgres...');

  // For Supabase deployments we use `public.profiles` instead of a local `users` table.
  // Leave migration for `users` commented out to avoid conflicting with Supabase-managed schema.

  await pool.query(`
    CREATE TABLE IF NOT EXISTS teams (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name       TEXT NOT NULL,
      lead_id    UUID REFERENCES public.profiles(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID NOT NULL REFERENCES public.profiles(id),
      started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at    TIMESTAMPTZ,
      duration_s  INTEGER,
      notes       TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_status (
      employee_id      UUID PRIMARY KEY REFERENCES public.profiles(id),
      current_status   TEXT NOT NULL DEFAULT 'offline',
      last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      session_id       UUID REFERENCES sessions(id),
      current_app      TEXT,
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS attendance (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id    UUID NOT NULL REFERENCES public.profiles(id),
      session_id     UUID REFERENCES sessions(id),
      check_in       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      check_out      TIMESTAMPTZ,
      total_minutes  INTEGER DEFAULT 0,
      status         TEXT NOT NULL DEFAULT 'working',
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS breaks (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      attendance_id   UUID NOT NULL REFERENCES attendance(id),
      started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at        TIMESTAMPTZ,
      duration_seconds INTEGER,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS recordings (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id          UUID NOT NULL REFERENCES public.profiles(id),
      session_id       UUID REFERENCES sessions(id),
      file_url         TEXT NOT NULL,
      duration_seconds INTEGER,
      captured_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_activity (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id          UUID NOT NULL REFERENCES public.profiles(id),
      session_id       UUID REFERENCES sessions(id),
      app_name         TEXT,
      duration_seconds INTEGER,
      start_time       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS screenshots (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID NOT NULL REFERENCES public.profiles(id),
      session_id   UUID REFERENCES sessions(id),
      file_url     TEXT NOT NULL,
      active_app   TEXT,
      activity_pct INTEGER DEFAULT 0,
      captured_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_events (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID NOT NULL REFERENCES public.profiles(id),
      session_id   UUID REFERENCES sessions(id),
      type         TEXT NOT NULL,
      app_name     TEXT,
      window_title TEXT,
      detail       TEXT,
      occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS alerts (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      from_user_id UUID NOT NULL REFERENCES public.profiles(id),
      to_user_id   UUID NOT NULL REFERENCES public.profiles(id),
      message      TEXT NOT NULL,
      is_read      BOOLEAN DEFAULT false,
      sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Indexes
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_screenshots_user ON screenshots(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_screenshots_time ON screenshots(captured_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_user   ON activity_events(user_id)`);

  // Default super admin
  // Ensure a default profile exists for super admin in `public.profiles` if missing.
  const { rows: existing } = await pool.query("SELECT id FROM public.profiles WHERE role = 'super_admin' LIMIT 1");
  if (!existing.length) {
    await pool.query(
      `INSERT INTO public.profiles (full_name, email, role) VALUES ($1, $2, $3)`,
      ['Super Admin', 'admin@company.com', 'super_admin']
    );
    console.log('✓ Default admin profile created: admin@company.com');
  }

  console.log('✓ All migrations complete');
  await pool.end();
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
