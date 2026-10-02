import { afterEach, describe, expect, it, vi } from 'vitest';
import { appDatabaseUrl, migrationDatabaseUrl } from './url';

afterEach(() => vi.unstubAllEnvs());

describe('database urls', () => {
  it('uses the pooled URL for the app and the direct URL for migrations, dropping non-standard params', () => {
    vi.stubEnv('POSTGRES_URL', 'postgres://postgres.abc:pw@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x');
    vi.stubEnv('POSTGRES_URL_NON_POOLING', 'postgres://postgres.abc:pw@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres?sslmode=require');
    expect(appDatabaseUrl()).toBe('postgres://postgres.abc:pw@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres?sslmode=require');
    expect(migrationDatabaseUrl()).toContain(':5432/');
  });

  it('falls back to DATABASE_URL, and to nothing (local PGlite)', () => {
    vi.stubEnv('POSTGRES_URL', '');
    vi.stubEnv('POSTGRES_URL_NON_POOLING', '');
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5432/db');
    expect(appDatabaseUrl()).toBe('postgres://u:p@localhost:5432/db');
    vi.stubEnv('DATABASE_URL', '');
    expect(appDatabaseUrl()).toBeUndefined();
  });
});
