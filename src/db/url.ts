// Connection strings. The Vercel ↔ Supabase integration sets POSTGRES_URL
// (Supavisor pooler, transaction mode, port 6543) for the app and
// POSTGRES_URL_NON_POOLING (direct connection) for migrations.
// DATABASE_URL is accepted as a fallback for other hosts.

/** Keep only `sslmode`: integration URLs carry extra query params (e.g. `supa=…`) that Postgres would reject as startup parameters. */
function clean(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const url = new URL(raw);
  for (const key of [...url.searchParams.keys()]) {
    if (key !== 'sslmode') url.searchParams.delete(key);
  }
  return url.toString();
}

export function appDatabaseUrl() {
  return clean(process.env.POSTGRES_URL || process.env.DATABASE_URL);
}

export function migrationDatabaseUrl() {
  return clean(process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.DATABASE_URL);
}
