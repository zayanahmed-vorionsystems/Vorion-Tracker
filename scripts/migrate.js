// scripts/migrate.js
// Run: node scripts/migrate.js
require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);
  console.log('Running migrations on Neon Postgres...');

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name        TEXT NOT NULL,
      email       TEXT UNIQUE NOT NULL,
      password    TEXT NOT NULL,
      role        TEXT NOT NULL CHECK(role IN ('super_admin','executive','qa_manager','team_lead','employee')),
      team_id     UUID,
      is_active   BOOLEAN NOT NULL DEFAULT true,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS teams (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name       TEXT NOT NULL,
      lead_id    UUID REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID NOT NULL REFERENCES users(id),
      started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at    TIMESTAMPTZ,
      duration_s  INTEGER,
      notes       TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS screenshots (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID NOT NULL REFERENCES users(id),
      session_id   UUID REFERENCES sessions(id),
      file_url     TEXT NOT NULL,
      active_app   TEXT,
      activity_pct INTEGER DEFAULT 0,
      captured_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS activity_events (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID NOT NULL REFERENCES users(id),
      session_id   UUID REFERENCES sessions(id),
      type         TEXT NOT NULL,
      app_name     TEXT,
      window_title TEXT,
      detail       TEXT,
      occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS alerts (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      from_user_id UUID NOT NULL REFERENCES users(id),
      to_user_id   UUID NOT NULL REFERENCES users(id),
      message      TEXT NOT NULL,
      is_read      BOOLEAN DEFAULT false,
      sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_screenshots_user ON screenshots(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_screenshots_time ON screenshots(captured_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_activity_user   ON activity_events(user_id)`;

  // Default super admin
  const bcrypt = require('bcryptjs');
  const existing = await sql`SELECT id FROM users WHERE role = 'super_admin' LIMIT 1`;
  if (!existing.length) {
    const hash = bcrypt.hashSync('admin123', 10);
    await sql`
      INSERT INTO users (name, email, password, role)
      VALUES ('Super Admin', 'admin@company.com', ${hash}, 'super_admin')
    `;
    console.log('✓ Default admin: admin@company.com / admin123');
  }

  console.log('✓ All migrations complete');
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
