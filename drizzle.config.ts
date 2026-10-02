import { defineConfig } from 'drizzle-kit';
import { migrationDatabaseUrl } from './src/db/url';

// `npm run db:generate` writes SQL migrations to ./drizzle.
// `npm run db:migrate` applies them to Supabase over the direct (non-pooled)
// connection. Local PGlite databases are migrated by the app on first use.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: migrationDatabaseUrl() ?? '' },
});
