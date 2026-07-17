const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { list, del } = require('@vercel/blob');
const { Pool } = require('pg');

for (const envPath of ['.env.local', '.env']) {
  const fullPath = path.resolve(process.cwd(), envPath);
  if (fs.existsSync(fullPath)) dotenv.config({ path: fullPath });
}

const args = new Set(process.argv.slice(2));
const shouldDelete = args.has('--delete');
const olderThanHoursArg = process.argv.find((arg) => arg.startsWith('--older-than-hours='));
const olderThanHours = olderThanHoursArg ? Number(olderThanHoursArg.split('=')[1]) : 24;
const cutoff = Date.now() - Math.max(1, olderThanHours || 24) * 60 * 60 * 1000;

function getVercelBlobPath(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!url.hostname.endsWith('.blob.vercel-storage.com')
      && !url.hostname.endsWith('.public.blob.vercel-storage.com')
      && !url.hostname.endsWith('.vercel-storage.com')) {
      return '';
    }
    return decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  } catch {
    return '';
  }
}

async function listScreenshotBlobs() {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix: 'screenshots/', cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.cursor;
  } while (cursor);
  return blobs;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('BLOB_READ_WRITE_TOKEN is required');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const rows = await pool.query(`
      SELECT blob_url, file_url
      FROM screenshots
      WHERE COALESCE(blob_url, file_url) IS NOT NULL
    `);
    const committedPaths = new Set();
    for (const row of rows.rows) {
      for (const rawUrl of [row.blob_url, row.file_url]) {
        const blobPath = rawUrl ? getVercelBlobPath(rawUrl) : '';
        if (blobPath) committedPaths.add(blobPath);
      }
    }

    const blobs = await listScreenshotBlobs();
    const orphans = blobs.filter((blob) => {
      const uploadedAt = blob.uploadedAt ? new Date(blob.uploadedAt).getTime() : Date.now();
      return uploadedAt < cutoff && !committedPaths.has(blob.pathname);
    });

    console.log(JSON.stringify({
      mode: shouldDelete ? 'delete' : 'dry-run',
      olderThanHours,
      committedScreenshotPaths: committedPaths.size,
      totalScreenshotBlobs: blobs.length,
      orphanCandidates: orphans.length,
      candidates: orphans.map((blob) => ({
        pathname: blob.pathname,
        uploadedAt: blob.uploadedAt,
        size: blob.size,
        url: blob.url,
      })),
    }, null, 2));

    if (shouldDelete) {
      for (const blob of orphans) {
        await del(blob.url);
        console.log('[orphan-cleanup] deleted', blob.pathname);
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[orphan-cleanup] failed', error);
  process.exitCode = 1;
});
