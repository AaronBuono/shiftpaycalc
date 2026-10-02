import 'server-only';

import { and, eq, gte, isNotNull } from 'drizzle-orm';

import { schema, type Db } from '@/db';
import { decryptSecret } from './crypto';
import { latest, getSettingsHistory } from './data';
import { normaliseFeedUrl, parseIcs, type IcsEvent } from './ics';
import { roundToQuarterHour } from './pay/engine';

import type { SyncSummary } from './sync-types';
export type { SyncSummary };

const FETCH_TIMEOUT_MS = 15_000;

async function fetchFeed(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(normaliseFeedUrl(url), {
      headers: { Accept: 'text/calendar, text/plain;q=0.9', 'User-Agent': 'ShiftPay/1.0 (+calendar sync)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') throw new Error('Calendar feed took too long to respond.');
    throw new Error('Couldn’t reach the calendar feed. Check the link is correct.');
  }
  // Never include the URL in errors — it contains an access token.
  if (!res.ok) throw new Error(`Calendar feed returned HTTP ${res.status}.`);
  const text = await res.text();
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Calendar feed did not return iCalendar data.');
  return text;
}

/** Fetch, parse and upsert one user's roster. Records the outcome on calendar_sources. */
export async function syncUser(db: Db, userId: string): Promise<SyncSummary> {
  const [source] = await db.select().from(schema.calendarSources).where(eq(schema.calendarSources.userId, userId));
  if (!source) throw new Error('No calendar connected.');

  try {
    const settings = latest(await getSettingsHistory(db, userId));
    const text = await fetchFeed(await decryptSecret(source.encryptedUrl));
    const { events } = parseIcs(text, settings.timeZone);
    const summary = await applyEvents(db, userId, events);
    await db
      .update(schema.calendarSources)
      .set({ lastSyncedAt: new Date(), lastStatus: 'ok', lastError: null, lastSummary: JSON.stringify(summary) })
      .where(eq(schema.calendarSources.userId, userId));
    return summary;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed.';
    await db
      .update(schema.calendarSources)
      .set({ lastSyncedAt: new Date(), lastStatus: 'error', lastError: message.slice(0, 300) })
      .where(eq(schema.calendarSources.userId, userId));
    throw new Error(message);
  }
}

export async function applyEvents(db: Db, userId: string, events: IcsEvent[]): Promise<SyncSummary> {
  const summary: SyncSummary = { added: 0, updated: 0, conflicts: 0, removed: 0, unchanged: 0 };
  const now = new Date();

  const existing = await db
    .select()
    .from(schema.shifts)
    .where(and(eq(schema.shifts.userId, userId), isNotNull(schema.shifts.uid)));
  const byUid = new Map(existing.map((s) => [s.uid!, s]));
  const live = new Set<string>();

  for (const ev of events) {
    if (ev.cancelled) continue;
    const start = new Date(roundToQuarterHour(ev.startUtc));
    const end = new Date(roundToQuarterHour(ev.endUtc));
    if (end <= start || end.getTime() - start.getTime() >= 24 * 3_600_000) continue;
    live.add(ev.uid);

    const row = byUid.get(ev.uid);
    if (row?.deletedByUser) continue;
    if (!row) {
      await db
        .insert(schema.shifts)
        .values({ id: crypto.randomUUID(), userId, uid: ev.uid, source: 'synced', startUtc: start, endUtc: end, title: ev.summary })
        .onConflictDoNothing();
      summary.added++;
      continue;
    }

    const sameTimes = row.startUtc.getTime() === start.getTime() && row.endUtc.getTime() === end.getTime();
    if (row.editedByUser) {
      // Keep the hand edit; record the feed's different times for the user to
      // resolve. If they already chose "keep mine" for these exact feed times,
      // stay quiet until the roster changes again.
      const sameConflict =
        row.conflictStartUtc?.getTime() === start.getTime() && row.conflictEndUtc?.getTime() === end.getTime();
      const next = sameTimes
        ? { conflictStartUtc: null, conflictEndUtc: null, conflictDismissed: false }
        : sameConflict
          ? { conflictStartUtc: start, conflictEndUtc: end, conflictDismissed: row.conflictDismissed }
          : { conflictStartUtc: start, conflictEndUtc: end, conflictDismissed: false };
      const changed =
        row.conflictStartUtc?.getTime() !== next.conflictStartUtc?.getTime() ||
        row.conflictEndUtc?.getTime() !== next.conflictEndUtc?.getTime() ||
        row.conflictDismissed !== next.conflictDismissed ||
        row.removedFromFeed;
      if (changed) {
        await db
          .update(schema.shifts)
          .set({ ...next, removedFromFeed: false, updatedAt: now })
          .where(eq(schema.shifts.id, row.id));
      }
      if (!sameTimes && !next.conflictDismissed) summary.conflicts++;
      else summary.unchanged++;
      continue;
    }

    if (sameTimes && !row.removedFromFeed && row.title === ev.summary) {
      summary.unchanged++;
      continue;
    }
    await db
      .update(schema.shifts)
      .set({ startUtc: start, endUtc: end, title: ev.summary, removedFromFeed: false, updatedAt: now })
      .where(eq(schema.shifts.id, row.id));
    summary.updated++;
  }

  // Feeds only cover a window of dates, so past shifts that drop out are kept.
  // Only future shifts missing from the feed are treated as removed.
  const future = await db
    .select({ id: schema.shifts.id, uid: schema.shifts.uid, removed: schema.shifts.removedFromFeed })
    .from(schema.shifts)
    .where(
      and(
        eq(schema.shifts.userId, userId),
        eq(schema.shifts.source, 'synced'),
        eq(schema.shifts.deletedByUser, false),
        gte(schema.shifts.startUtc, now),
      ),
    );
  for (const s of future) {
    if (s.uid && !live.has(s.uid) && !s.removed) {
      await db.update(schema.shifts).set({ removedFromFeed: true, updatedAt: now }).where(eq(schema.shifts.id, s.id));
      summary.removed++;
    }
  }
  return summary;
}

/** Cron entry point: sync every connected user, one failure doesn't stop the rest. */
export async function syncAll(db: Db) {
  const sources = await db.select({ userId: schema.calendarSources.userId }).from(schema.calendarSources);
  const results: { userId: string; ok: boolean; error?: string }[] = [];
  for (const { userId } of sources) {
    try {
      await syncUser(db, userId);
      results.push({ userId, ok: true });
    } catch (err) {
      results.push({ userId, ok: false, error: err instanceof Error ? err.message : 'failed' });
    }
  }
  return results;
}
