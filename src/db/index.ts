import 'server-only';

import path from 'node:path';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';
import { appDatabaseUrl } from './url';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const globalForDb = globalThis as unknown as { __db?: Promise<Db> };

/**
 * Production (Vercel): Supabase Postgres via POSTGRES_URL (see ./url.ts).
 * Local dev without a database URL: an embedded PGlite database in ./.pglite,
 * migrated automatically on first use.
 */
export function getDb(): Promise<Db> {
  globalForDb.__db ??= connect().catch((err) => {
    globalForDb.__db = undefined; // retry on the next request
    throw err;
  });
  return globalForDb.__db;
}

async function connect(): Promise<Db> {
  const url = appDatabaseUrl();
  if (url) {
    const { default: postgres } = await import('postgres');
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    const client = postgres(url, {
      prepare: false, // Supabase's transaction-mode pooler doesn't support prepared statements
      ssl: local ? false : 'require',
      max: 5,
      idle_timeout: 20,
    });
    return drizzle({ client, schema }) as unknown as Db;
  }
  if (process.env.VERCEL) throw new Error('POSTGRES_URL is not set.');

  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const client = new PGlite(path.join(process.cwd(), '.pglite'));
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
  return db as unknown as Db;
}

export { schema };
