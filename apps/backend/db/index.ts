import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeonHttp } from 'drizzle-orm/neon-http';
import { drizzle as drizzleNodePostgres } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema.ts';

type NeonDatabase = ReturnType<typeof drizzleNeonHttp<typeof schema>>;
// Single dialect surface: every route is written against the Neon typing.
// The node-postgres instance is adapted to it at runtime (see below), so
// adding the self-host driver cannot break typechecking route by route.
type SpiceDatabase = NeonDatabase;

let dbInstance: SpiceDatabase | null = null;
let pgPool: Pool | null = null;

/**
 * True for Neon cloud URLs (SQL-over-HTTP driver). Anything else — including
 * self-hosted Postgres on a VPS — uses node-postgres with a pooled TCP
 * connection (which also supports LISTEN, unlike pooled Neon).
 */
export function isNeonDatabaseUrl(databaseUrl: string): boolean {
  try {
    return new URL(databaseUrl).hostname.endsWith('.neon.tech');
  } catch {
    return false;
  }
}

/** Closes the node-postgres pool on self-hosted setups. No-op for Neon. */
export function closeDatabasePool(): Promise<void> {
  const pool = pgPool;
  pgPool = null;
  dbInstance = null;
  return pool ? pool.end() : Promise.resolve();
}

export const db = new Proxy({} as SpiceDatabase, {
  get(_target, prop) {
    if (!dbInstance) {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error('DATABASE_URL is not set');
      }
      if (isNeonDatabaseUrl(databaseUrl)) {
        const sql = neon(databaseUrl);
        dbInstance = drizzleNeonHttp(sql, { schema });
      } else {
        pgPool = new Pool({ connectionString: databaseUrl });
        dbInstance = adaptNodePostgres(pgPool);
      }
    }
    return Reflect.get(dbInstance, prop);
  },
});

/**
 * Adapts pooled node-postgres to the Neon dialect surface the routes are
 * written against. Query builders, transactions, and relational queries are
 * API-identical; only `batch` (neon-http runs the list in one round trip)
 * needs emulation, executed sequentially for ordered results.
 */
function adaptNodePostgres(pool: Pool): SpiceDatabase {
  const pgDb = drizzleNodePostgres(pool, { schema });
  return new Proxy(pgDb, {
    get(target, prop) {
      if (prop === 'batch') {
        return async (queries: Array<PromiseLike<unknown>>) => {
          const results: unknown[] = [];
          for (const query of queries) results.push(await query);
          return results;
        };
      }
      const value = Reflect.get(target, prop);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
      return typeof value === 'function' ? (value as Function).bind(target) : value;
    },
  }) as unknown as SpiceDatabase;
}
