// Stoner Bud-E — apply migrations/*.sql to DATABASE_URL, in filename order.
// Run once the Neon project exists and DATABASE_URL is set:
//   DATABASE_URL=... npm run db:setup
// (or export DATABASE_URL first, then `node scripts/setup-db.mjs`.)
//
// Prints exactly `applied` on success, or `error: <message>` on stderr with
// a non-zero exit on failure. The URL itself is NEVER printed or logged.
// Applied files are recorded by name in `_migrations` and never run again.

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error('error: DATABASE_URL is not set');
    process.exit(1);
  }
  const files = (await readdir(dir))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  if (files.length === 0) {
    console.error('error: no .sql files found in migrations/');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await pool.query(
      `create table if not exists _migrations (
         name text primary key,
         applied_at timestamptz not null default CURRENT_TIMESTAMP
       )`,
    );
    for (const file of files) {
      const already = await pool.query('select 1 from _migrations where name = $1', [file]);
      if (already.rowCount !== 0) continue;
      const sql = await readFile(join(dir, file), 'utf-8');
      await pool.query(sql);
      await pool.query('insert into _migrations (name) values ($1)', [file]);
    }
  } finally {
    await pool.end();
  }
  console.log('applied');
}

main().catch((err) => {
  console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
