// Applies pending drizzle migrations against DATABASE_URL and exits.
// Runs inside the self-host container before the Next.js server boots
// (see deploy/docker-entrypoint.sh). Idempotent: drizzle tracks applied
// migrations in __drizzle_migrations, so re-runs are no-ops.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('migrate-selfhost: DATABASE_URL is not set.');
  process.exitCode = 1;
} else {
  const migrationsFolder = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'db',
    'migrations',
  );
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    console.log(`migrate-selfhost: applying migrations from ${migrationsFolder}`);
    await migrate(drizzle(pool), { migrationsFolder });
    console.log('migrate-selfhost: database is up to date.');
  } catch (error) {
    console.error('migrate-selfhost: migration failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}
