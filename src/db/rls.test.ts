import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, it } from 'vitest';

import * as schema from './schema';

// Supabase's Data API reads the public schema as the `anon` role. These tests
// make sure no table is readable that way.

let client: PGlite;

beforeAll(async () => {
  client = new PGlite();
  await migrate(drizzle({ client, schema }), { migrationsFolder: path.join(__dirname, '../../drizzle') });
  await client.exec(`
    INSERT INTO "user" (id, name, email) VALUES ('u1', 'Owner', 'owner@example.test');
    INSERT INTO invites (token, email, created_by, expires_at) VALUES ('secret-token', 'x@example.test', 'u1', now() + interval '1 day');
    CREATE ROLE anon;
    GRANT USAGE ON SCHEMA public TO anon;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon; -- what Supabase grants by default
  `);
});

describe('row level security', () => {
  it('is enabled on every table in the public schema', async () => {
    const { rows } = await client.query<{ relname: string; relrowsecurity: boolean }>(`
      SELECT c.relname, c.relrowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
    `);
    expect(rows.length).toBe(10);
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
  });

  it('hides all rows from the anon role, while the owner still sees them', async () => {
    const owner = await client.query('SELECT token FROM invites');
    expect(owner.rows).toHaveLength(1);

    await client.exec('SET ROLE anon');
    try {
      expect((await client.query('SELECT * FROM invites')).rows).toHaveLength(0);
      expect((await client.query('SELECT * FROM "user"')).rows).toHaveLength(0);
    } finally {
      await client.exec('RESET ROLE');
    }
  });
});
