require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r1 = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='screenshots' ORDER BY ordinal_position");
    console.log('screenshots columns:', r1.rows.map(r => r.column_name).join(','));
    const r2 = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='sessions' ORDER BY ordinal_position");
    console.log('sessions columns:', r2.rows.map(r => r.column_name).join(','));
  } catch (e) {
    console.error('DB error', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
