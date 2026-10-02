# Shift Pay Calculator — Web App PRD

Oct 2, 2026 · @Aaron Jacob Buono · v2

Turn the existing standalone HTML pay calculator into a hosted web app. Shifts sync automatically from Humanforce and are saved, so weekly pay and pay history appear on a dashboard without manual entry. The app is built for AJ first but designed so other people can sign up later and set it up for their own award rates.

## Goals & success criteria

- No more typing in date/time/public-holiday for each shift by hand
- Shifts are **saved**, so nothing needs re-entering each week or after a page refresh
- A **weekly view** (Mon–Sun by default, fortnightly as an option) shows total pay and hours, and updates automatically once shifts sync
- A **pay history chart** across past weeks/fortnights
- Public holidays in Victoria are **auto-marked**, so there's no ticking boxes
- Pay is correct for shifts that cross a **daylight saving** change
- Same pay logic as the current calculator (rate table, evening/night loading, unpaid break, public holiday override), carried over exactly and not rebuilt from scratch
- Usable from a phone browser as a normal website, no file-viewer app needed
- Rates, loadings, pay period, break and holiday region are **per-user settings**, so other people can use it later without code changes

## Current calculator

A single self-contained HTML file (no backend) that AJ fills in manually today. Port its logic as-is into the new app rather than redesigning it:

- All calculation logic lives in one `calcShift()` function. Port it as a **pure TypeScript module** with unit tests, and replace the hardcoded `RATES` constant with the user's settings
- Per-shift breakdown showing each rate segment and the resulting subtotal, kept in the new app
- The custom calendar date picker and typed H:MM time entry existed only because native iOS pickers didn't render in AJ's HTML viewer app. The hosted site uses normal native date/time inputs (15-minute steps) for manual entry
- Times round to 15 minutes. This is correct, since pay is only calculated in 15-minute blocks, and Humanforce shifts already start and end on :00, :15, :30 or :45

## Pay calculation rules

These are AJ's **default** settings. Every rate, loading, time window and break value below can be edited per user in Settings.

| Rule | Default | Applies | Segment tag |
| --- | --- | --- | --- |
| Base | $27.08/hr | reference rate | — |
| Mon–Fri (125%) | $33.85/hr | Mon–Fri day rate | Day |
| Saturday (150%) | $40.62/hr | Saturdays | Day |
| Sunday (175%) | $47.39/hr | Sundays | Day |
| Public holiday (250%) | $67.70/hr | Flat override, no evening/night loading stacks on top | Holiday |
| Evening loading | +$2.95/hr | 7pm–12am, Mon–Fri only | **Evening** |
| Night loading | +$4.22/hr | 12am–7am, Mon–Fri only | **Night** |
| Unpaid break | −30 min | Auto-deducted on any shift over 6h, cut from the end of the shift | Break |

- A shift crossing midnight is split at the calendar-day boundary before these rules apply, so each portion gets its own day's rate.
- **Segment tags:** the old calculator labelled both loadings "Night". The new app splits them into **Evening** (7pm–12am) and **Night** (12am–7am), so each tag matches the loading applied.
- **Break:** the length (default 30 min) and the shift-length threshold (default >6h) are user settings. A single shift can override the break, e.g. "no break taken" or "break taken at a different time".
- **Validation:** shifts of 24h or more and zero-length shifts are rejected rather than calculated. Humanforce won't produce them and AJ doesn't work them.

## Daylight saving & time zones

Victorian daylight saving **starts Sunday 4 Oct 2026** (2am → 3am) and ends on the first Sunday of April (3am → 2am). The old calculator works out shift length by subtracting clock times, so an overnight shift across either change is off by an hour.

- Store every shift's start and end as **UTC timestamps**, plus the user's IANA time zone (default `Australia/Melbourne`)
- Split into day/evening/night segments using **local clock time**, so the 7pm and 7am window edges are local
- Calculate **paid hours from real elapsed time**. A 10pm–6am shift on the night DST starts is 7h worked, and on the night it ends it's 9h worked (before the break comes off)
- Unit tests must cover overnight shifts across both the October and April changes

## Public holidays

Humanforce's calendar feed doesn't mark public holidays, so the app detects them itself.

- A `public_holidays` table holds holidays per state, seeded with **Victoria for 2026 and 2027** (including AFL Grand Final Friday) and refreshed yearly
- A shift portion that falls on a public holiday in the user's state is **auto-marked** and paid at the holiday rate
- **Melbourne Cup Day** is a setting, on by default (metro Melbourne). Regional users can turn it off and add their own local holiday date
- The manual "Public holiday" toggle on a shift stays, to override auto-detection either way
- Holidays apply **per calendar day**: if an overnight shift runs into a public holiday, only the post-midnight portion is paid at the holiday rate. This replaces the old calculator's behaviour of applying the holiday rate only to the start date (see Resolved decisions)

## Humanforce calendar sync

The browser can't read the Humanforce feed directly. Calendar endpoints don't send the CORS headers a browser needs, so a backend job fetches the feed server-side and stores the parsed shifts.

**Pipeline:** Humanforce ICS feed → Vercel Cron (`/api/cron/sync`) → parse `VEVENT`s → de-duplicate / upsert → Postgres → pay engine → dashboard

**Requirements**

- Each user's webcal URL is stored **encrypted** (AES-256-GCM) in the database. The encryption key is a Vercel environment variable and the URL is never sent to the browser
- Sync **daily** via Vercel Cron (protected by `CRON_SECRET`), plus a **"Sync now"** button for an immediate refresh
- Parse ICS `VEVENT` entries into shift records (UID, start, end), converting their time zones to UTC timestamps
- Upsert on the ICS `UID`, since Humanforce may resend the same event with updated times
- If a synced update would overwrite a shift the user edited manually, keep the manual edit and **flag the conflict** in the UI
- Shifts that disappear from the feed are marked as removed, not hard-deleted
- Users can add, edit and delete shifts manually, since synced data can lag or be wrong
- Show a **last-synced timestamp** so it's obvious when the feed is stale

## Dashboard & UI

Built on the watermelon **library-dashboard** template. Keep its layout and components, swap the library content for pay content, and replace its colours.

```
npx shadcn@latest add https://registry.watermelon.sh/r/library-dashboard.json
```

The template uses Next.js App Router, shadcn/ui (sidebar, card, chart, sheet, dropdown, tooltip), Recharts and lucide-react.

| Template piece | Becomes |
| --- | --- |
| Metric cards | This period's pay · paid hours · shift count · next shift |
| Circulation area chart (weekly/monthly/yearly toggle) | **Pay history**: total pay per week or fortnight |
| Collection donut chart | **Pay breakdown**: Day / Evening / Night / Holiday / Weekend share of earnings |
| Recent activity feed | Recently synced or changed shifts, including sync conflicts |
| Sidebar nav | Dashboard · Shifts · Settings |
| Topbar | Period switcher (prev/next week), "Sync now", last-synced time |
| Mobile bottom nav | Kept, since the phone is the main device |

**Shifts page:** a list of shifts for the selected period, each with the per-segment breakdown from the old calculator, plus add/edit/delete.

**Settings page:** pay rates, loadings and their time windows and days, pay period (weekly or fortnightly, and the start day), break length and threshold, state/holiday region, Melbourne Cup toggle, custom holidays, time zone and Humanforce calendar URL.

### Colour system: warm graphite + coral

Dark theme only for v1. Replaces the template's colours and the old gold/teal palette.

| Token | Hex | Used for |
| --- | --- | --- |
| Background | `#141211` | page |
| Surface | `#1C1A18` | cards, sidebar |
| Border | `#2C2926` | dividers, card edges |
| Text | `#F2EEE9` | primary text |
| Accent (coral) | `#FF7A59` | pay totals, primary buttons, chart line |
| Evening | `#FBBF24` | Evening tag / chart segment |
| Night | `#60A5FA` | Night tag / chart segment |
| Holiday | `#A78BFA` | Holiday tag, PH badge |
| Day | muted grey | Day tag |
| Danger | `#EF4444` | Break deduction, delete, sync errors |

## Tech stack & hosting

The whole app runs on free tiers: Vercel Hobby and Supabase's free plan.

- **Frontend + API:** Next.js (App Router) on **Vercel**, as one deployable
- **Database:** **Supabase Postgres** (added through the Vercel Marketplace) with **Drizzle ORM** for schema and migrations. Supabase is used only as the database: login stays on Better Auth, and Supabase's auto-generated Data API is locked out with Row Level Security on every table. Local development uses an embedded Postgres (PGlite), so no account is needed to run it
- **Auth:** **Better Auth** (email + optional Google sign-in), stored in Postgres
- **Scheduled sync:** **Vercel Cron**, daily at about 5–6am Melbourne time (the Hobby plan allows one run a day)
- **Secrets:** Vercel environment variables for the database URL, auth secret, encryption key and cron secret

## Data model

- `users`: managed by Better Auth
- `settings`: one row per user per `effective_from` date (rate history), holding rates, loading amounts and windows, applicable days, pay period type and start day, break length and threshold, state, Melbourne Cup on/off, time zone
- `shifts`: user, ICS UID (nullable for manual shifts), start (UTC), end (UTC), source (`synced` | `manual`), holiday override, break override, edited-by-user flag, removed-from-feed flag
- `calendar_sources`: user, encrypted webcal URL, last synced at, last sync status/error
- `public_holidays`: state, date, name (shared reference data)
- `custom_holidays`: user, date, name
- `invites`: token, created by, email, expires at, used at

## Security & privacy

The Humanforce webcal link contains an access token, so anyone holding it can see that person's shift schedule. Handle it as a credential, not a bookmark.

- Store webcal URLs server-side only, encrypted at rest, never sent to or stored in the browser
- Never log the full URL in plaintext (server logs, error tracking, etc.)
- **Login is required.** Every page and API route sits behind Better Auth
- **Invite-only sign-up:** an account can only be created for an email with an open invite from AJ (or AJ's own `ADMIN_EMAIL`). This applies to both password and Google sign-up. Invite links expire after 14 days
- **Per-user isolation:** every query is scoped to the signed-in user, and nobody can read another user's shifts, settings or calendar URL
- **No public database API:** Row Level Security is enabled on every table with no policies, so Supabase's REST API (public anon key) returns nothing

## Out of scope for v1

- Multiple employers/jobs per user
- Reconciling calculated pay against an actual payslip
- Tax or superannuation calculations
- A native mobile app (a responsive website is enough)
- Light mode
- Public holiday data for states other than VIC (the structure supports them; only VIC is seeded)

## Resolved decisions

- **Holiday rule for overnight shifts:** holidays apply per calendar day. If a shift runs into a public holiday, only the part after midnight is paid at 250%. If a shift starts on a public holiday and runs past midnight into a normal day, the part after midnight goes back to normal rates.
- **Rate history:** past shifts keep the rates they were calculated with. Settings rows carry an `effective_from` date, and each shift uses the settings in effect on its start date. Rates rarely change, so this is low priority for v1, but the schema includes it from the start to avoid a migration later.
- **Weekend after a weekday night:** the 12am–7am part of a Friday-night shift is paid at the Saturday rate with **no** night loading. This matches the award and the current rule.
- **Sign-up policy:** **invite-only** for now. AJ creates invite links, and there is no open sign-up page.

## Open questions

- None outstanding for v1.
