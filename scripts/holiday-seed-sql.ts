// Prints an idempotent SQL seed for public_holidays from src/lib/holidays/data.ts.
// Yearly refresh: add the new dates to data.ts, then
//   npx drizzle-kit generate --custom --name holidays_<year>
//   npx tsx scripts/holiday-seed-sql.ts > drizzle/<that file>.sql
import { PUBLIC_HOLIDAYS } from '../src/lib/holidays/data';

const q = (s: string | undefined) => (s == null ? 'NULL' : `'${s.replace(/'/g, "''")}'`);
const rows = PUBLIC_HOLIDAYS.map((h) => `  (${q(h.state)}, ${q(h.date)}, ${q(h.name)}, ${q(h.regional)})`);
console.log(
  `INSERT INTO "public_holidays" ("state", "date", "name", "regional") VALUES\n${rows.join(',\n')}\n` +
    `ON CONFLICT ("state", "date") DO UPDATE SET "name" = excluded."name", "regional" = excluded."regional";`,
);
