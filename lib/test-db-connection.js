// test-db-connection.js
// Run this directly with: node test-db-connection.js
// It bypasses Next.js/webpack entirely so we can see the RAW connection time
// to Supabase, isolated from any dev-server/CPU overhead.
//
// Usage:
//   1. Put your DATABASE_URL below (or set it as an env var before running)
//   2. node test-db-connection.js

const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL || 'PASTE_YOUR_DATABASE_URL_HERE';

async function testConnection(label) {
  const start = Date.now();
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 15000,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const connectMs = Date.now() - start;
    console.log(`[${label}] Connected in ${connectMs}ms`);

    const queryStart = Date.now();
    await client.query('SELECT 1');
    const queryMs = Date.now() - queryStart;
    console.log(`[${label}] Simple query (SELECT 1) took ${queryMs}ms`);

    await client.end();
    return { ok: true, connectMs, queryMs };
  } catch (err) {
    const failMs = Date.now() - start;
    console.error(`[${label}] FAILED after ${failMs}ms:`, err.message);
    try { await client.end(); } catch {}
    return { ok: false, failMs, error: err.message };
  }
}

(async () => {
  console.log('--- DB connectivity test (bypasses Next.js/webpack) ---');
  console.log('Target:', connectionString.replace(/:[^:@]+@/, ':****@')); // hide password in logs

  // Run 5 times back-to-back so we can see if it's consistently slow
  // or intermittent (which would point to network instability rather
  // than a fixed round-trip distance issue).
  for (let i = 1; i <= 5; i++) {
    await testConnection(`attempt ${i}`);
  }

  console.log('--- Done ---');
  console.log('If each attempt connects in <1000ms: the DB/network is fine,');
  console.log('  the slowness is coming from the Next.js dev server / machine load.');
  console.log('If attempts are consistently >3000ms or failing: it is a real');
  console.log('  network/Supabase-side issue independent of your app code.');
})();