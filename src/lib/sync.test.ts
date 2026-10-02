import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeEach, describe, expect, it } from 'vitest';

import * as schema from '@/db/schema';
import type { Db } from '@/db';
import type { IcsEvent } from './ics';
import { applyEvents } from './sync';

const HOUR = 3_600_000;
const QUARTER = 15 * 60_000;
const future = Math.round((Date.now() + 7 * 24 * HOUR) / QUARTER) * QUARTER;
const past = Math.round((Date.now() - 7 * 24 * HOUR) / QUARTER) * QUARTER;
const ev = (uid: string, start: number, hours = 6, extra: Partial<IcsEvent> = {}): IcsEvent => ({
  uid,
  startUtc: start,
  endUtc: start + hours * HOUR,
  summary: 'Shift',
  cancelled: false,
  ...extra,
});

let db: Db;
const USER = 'u1';

async function rows() {
  return db.select().from(schema.shifts).where(eq(schema.shifts.userId, USER));
}
async function byUid(uid: string) {
  return (await rows()).find((r) => r.uid === uid)!;
}

beforeEach(async () => {
  const client = new PGlite();
  const d = drizzle({ client, schema });
  await migrate(d, { migrationsFolder: path.join(__dirname, '../../drizzle') });
  db = d as unknown as Db;
  await db.insert(schema.user).values({ id: USER, name: 'Test', email: 't@example.test' });
});

describe('applyEvents', () => {
  it('adds new shifts and is idempotent', async () => {
    const feed = [ev('a', future), ev('b', future + 24 * HOUR)];
    expect(await applyEvents(db, USER, feed)).toMatchObject({ added: 2 });
    expect(await applyEvents(db, USER, feed)).toMatchObject({ added: 0, unchanged: 2 });
    expect(await rows()).toHaveLength(2);
  });

  it('updates times when the roster changes', async () => {
    await applyEvents(db, USER, [ev('a', future)]);
    expect(await applyEvents(db, USER, [ev('a', future + HOUR)])).toMatchObject({ updated: 1 });
    expect((await byUid('a')).startUtc.getTime()).toBe(future + HOUR);
  });

  it('keeps hand edits and flags a conflict; "keep mine" stays quiet until the roster changes again', async () => {
    await applyEvents(db, USER, [ev('a', future)]);
    const row = await byUid('a');
    await db.update(schema.shifts).set({ editedByUser: true, endUtc: new Date(future + 8 * HOUR) }).where(eq(schema.shifts.id, row.id));

    expect(await applyEvents(db, USER, [ev('a', future, 5)])).toMatchObject({ conflicts: 1 });
    let r = await byUid('a');
    expect(r.endUtc.getTime()).toBe(future + 8 * HOUR); // hand edit kept
    expect(r.conflictEndUtc?.getTime()).toBe(future + 5 * HOUR);

    await db.update(schema.shifts).set({ conflictDismissed: true }).where(eq(schema.shifts.id, row.id));
    expect(await applyEvents(db, USER, [ev('a', future, 5)])).toMatchObject({ conflicts: 0, unchanged: 1 });

    expect(await applyEvents(db, USER, [ev('a', future, 4)])).toMatchObject({ conflicts: 1 });
    r = await byUid('a');
    expect(r.conflictDismissed).toBe(false);
  });

  it('marks future shifts missing from the feed as removed, but keeps past ones', async () => {
    await applyEvents(db, USER, [ev('old', past), ev('soon', future)]);
    expect(await applyEvents(db, USER, [])).toMatchObject({ removed: 1 });
    expect((await byUid('old')).removedFromFeed).toBe(false);
    expect((await byUid('soon')).removedFromFeed).toBe(true);
    // Reappearing restores it
    await applyEvents(db, USER, [ev('soon', future)]);
    expect((await byUid('soon')).removedFromFeed).toBe(false);
  });

  it('treats cancelled events as removed', async () => {
    await applyEvents(db, USER, [ev('a', future)]);
    expect(await applyEvents(db, USER, [ev('a', future, 6, { cancelled: true })])).toMatchObject({ removed: 1 });
  });

  it('does not re-add a synced shift the user deleted', async () => {
    await applyEvents(db, USER, [ev('a', future)]);
    await db.update(schema.shifts).set({ deletedByUser: true }).where(eq(schema.shifts.uid, 'a'));
    expect(await applyEvents(db, USER, [ev('a', future + HOUR)])).toMatchObject({ added: 0, updated: 0 });
    expect((await byUid('a')).startUtc.getTime()).toBe(future);
  });

  it('rounds to 15 minutes and skips 24h+ events', async () => {
    await applyEvents(db, USER, [ev('a', future + 7 * 60_000), ev('long', future, 24)]);
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0].startUtc.getTime() % QUARTER).toBe(0);
  });
});
