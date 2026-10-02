# Shift Pay

Weekly pay from your Humanforce roster. Shifts sync from the Humanforce calendar feed, pay is calculated with your award rates (evening/night loadings, weekend rates, Victorian public holidays, unpaid breaks, daylight saving), and a dashboard shows this week's pay and your pay history.

See [`Shift Pay Calculator — Web App PRD.md`](./Shift%20Pay%20Calculator%20—%20Web%20App%20PRD.md) for the product spec. The original single-file calculator is kept in [`shift-pay-calculator.html`](./shift-pay-calculator.html); the test suite checks the new pay engine against it.

## Stack

- **Next.js 16** (App Router, server actions) on **Vercel**
- **Supabase Postgres** + **Drizzle ORM** — local dev uses an embedded **PGlite** database in `./.pglite`, no account needed. Supabase is only used as the database (login is Better Auth)
- **Better Auth** — email/password (+ optional Google), invite-only
- **Vercel Cron** — daily roster sync (`vercel.json` → `/api/cron/sync`)
- UI from the watermelon `library-dashboard` shadcn template, recoloured warm graphite + coral

## Where things live

| Path | What |
| --- | --- |
| `src/lib/pay/engine.ts` | `calcShift()` — the pay engine (port of the HTML calculator, DST-correct) |
| `src/lib/pay/rules.ts` | Pay rule types and AJ's default rates |
| `src/lib/pay/periods.ts` | Weekly / fortnightly pay periods |
| `src/lib/ics.ts` | Calendar feed parser |
| `src/lib/sync.ts` | Fetch + upsert roster shifts, conflict handling |
| `src/lib/holidays/data.ts` | Public holiday dates (seeded into the DB) |
| `src/lib/data.ts` | Server-side queries for the pages |
| `src/app/actions.ts` | Server actions (every one checks the signed-in user) |
| `src/db/schema.ts` | Database schema; migrations in `drizzle/` |

## Run locally

```bash
npm install
cp .env.example .env.local   # then fill in the values (see comments in the file)
npm run dev
```

Leave `POSTGRES_URL` empty to use the local PGlite database. Sign up at `/signup` with the email you set as `ADMIN_EMAIL` — that's the only address that can sign up without an invite.

```bash
npm test          # pay engine, DST, holidays, periods, ICS parser, sync, RLS lockdown
npm run lint
```

## Deploy to Vercel

1. Push the repo to GitHub and import it in Vercel.
2. In the Vercel project, **Storage → Create → Supabase** (Marketplace). This creates the Supabase project and sets `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING` and the other Supabase variables. Pick a Sydney (ap-southeast-2) region.
3. Add environment variables (Production): `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (your site URL, e.g. `https://shiftpay.vercel.app`), `ADMIN_EMAIL`, `ENCRYPTION_KEY`, `CRON_SECRET` — generate secrets with `openssl rand -base64 32`.
4. Run the migrations against Supabase once (and after any schema change). Pull the env vars from Vercel first:
   ```bash
   npx vercel env pull .env.production.local --environment=production
   npm run db:migrate:prod
   ```
   (Or paste the direct connection string: `POSTGRES_URL_NON_POOLING="postgres://…" npm run db:migrate`.)
5. Deploy. Sign up with your `ADMIN_EMAIL`, then paste your Humanforce webcal link in **Settings → Humanforce roster**.

**Supabase's Data API:** every table has Row Level Security on with no policies, so Supabase's auto-generated REST API (which uses the public anon key) can't read anything. The app connects as the database owner and isn't affected. Keep `.enableRLS()` on any new table in `src/db/schema.ts` — a test fails if a table is missing it.

**Don't change `ENCRYPTION_KEY` after setup** — stored calendar links can't be decrypted without it (you'd just need to paste the link again).

### Optional: Google sign-in

Create an OAuth client in Google Cloud with redirect URI `https://<your-site>/api/auth/callback/google`, then set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

## Yearly maintenance

Public holidays are seeded through to the end of 2027. To add a new year, add the dates to `src/lib/holidays/data.ts`, then:

```bash
npx drizzle-kit generate --custom --name holidays_2028
npx tsx scripts/holiday-seed-sql.ts > drizzle/<the new file>.sql
npm run db:migrate
```

The AFL Grand Final Friday date is set by the Victorian government each year — the 2027 entry is a placeholder until it's announced.
