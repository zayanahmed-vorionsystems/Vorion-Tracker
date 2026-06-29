require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

async function main() {
  const email = process.env.NEW_EMP_EMAIL || process.argv[2];
  const password = process.env.NEW_EMP_PASSWORD || process.argv[3];
  const name = process.env.NEW_EMP_NAME || process.argv[4] || 'Employee Test';

  if (!email || !password) {
    console.error('Usage: NEW_EMP_EMAIL=... NEW_EMP_PASSWORD=... node scripts/create-employee.js');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const hashed = bcrypt.hashSync(password, 10);

  const existingRes = await pool.query('SELECT id FROM public.profiles WHERE LOWER(email) = $1 LIMIT 1', [String(email).toLowerCase()]);
  const existing = existingRes.rows[0];
  if (existing) {
    console.log('User already exists:', existing.id);
    process.exit(0);
  }
  const insertRes = await pool.query(
    `INSERT INTO public.profiles (full_name, email, role) VALUES ($1, $2, $3) RETURNING id, full_name AS name, email, role`,
    [name, email, 'employee']
  );
  const u = insertRes.rows[0];
  console.log('Created user:', u);
  await pool.end();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
