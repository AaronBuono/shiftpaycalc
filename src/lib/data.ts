import 'server-only';

import { and, asc, desc, eq, gte, lt } from 'drizzle-orm';

import { getDb, schema, type Db } from '@/db';
import { localParts, zonedToUtc } from './pay/dates';
import { calcShift, type ShiftResult } from './pay/engine';
import { periodFor, recentPeriods, type Period, type PeriodConfig } from './pay/periods';
import { DEFAULT_RULES, type PayRules } from './pay/rules';

export type SettingsRow = typeof schema.settings.$inferSelect;
export type ShiftRow = typeof schema.shifts.$inferSelect;

export const EARLIEST_EFFECTIVE = '2000-01-01';

/** All settings versions for a user, oldest first. Creates the defaults on first use. */
export async function getSettingsHistory(db: Db, userId: string): Promise<SettingsRow[]> {
  const rows = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.userId, userId))
    .orderBy(asc(schema.settings.effectiveFrom));
  if (rows.length) return rows;
  await db
    .insert(schema.settings)
    .values({ id: crypto.randomUUID(), userId, effectiveFrom: EARLIEST_EFFECTIVE, rules: DEFAULT_RULES })
    .onConflictDoNothing();
  return getSettingsHistory(db, userId);
}

export function latest(history: SettingsRow[]): SettingsRow {
  return history[history.length - 1];
}

/** Rates in effect on a local date (falls back to the oldest version). */
export function rulesOn(history: SettingsRow[], date: string): PayRules {
  let found = history[0];
  for (const row of history) if (row.effectiveFrom <= date) found = row;
  return found.rules;
}

export function periodConfig(s: SettingsRow): PeriodConfig {
  return { type: s.periodType, startDow: s.periodStartDow, anchorDate: s.periodAnchorDate };
}

export async function getHolidayChecker(db: Db, userId: string, s: SettingsRow) {
  const [publicRows, customRows] = await Promise.all([
    db.select().from(schema.publicHolidays).where(eq(schema.publicHolidays.state, s.state)),
    db.select().from(schema.customHolidays).where(eq(schema.customHolidays.userId, userId)),
  ]);
  const names = new Map<string, string>();
  for (const h of publicRows) {
    if (h.regional === 'melbourne-cup' && !s.melbourneCup) continue;
    names.set(h.date, h.name);
  }
  for (const h of customRows) names.set(h.date, h.name);
  return { isHoliday: (date: string) => names.has(date), nameOf: (date: string) => names.get(date) };
}

export type ShiftView = {
  id: string;
  source: ShiftRow['source'];
  title: string | null;
  startUtc: number;
  endUtc: number;
  localDate: string;
  localStartMin: number;
  localEndMin: number;
  holidayOverride: ShiftRow['holidayOverride'];
  breakOverrideMinutes: number | null;
  editedByUser: boolean;
  removedFromFeed: boolean;
  conflict: { startUtc: number; endUtc: number } | null;
  holidayName: string | null;
  updatedAt: number;
  pay: ShiftResult;
};

type Ctx = {
  history: SettingsRow[];
  timeZone: string;
  holidays: Awaited<ReturnType<typeof getHolidayChecker>>;
};

export async function loadContext(db: Db, userId: string): Promise<Ctx> {
  const history = await getSettingsHistory(db, userId);
  const current = latest(history);
  return { history, timeZone: current.timeZone, holidays: await getHolidayChecker(db, userId, current) };
}

export function toView(row: ShiftRow, ctx: Ctx): ShiftView {
  const startUtc = row.startUtc.getTime();
  const endUtc = row.endUtc.getTime();
  const start = localParts(startUtc, ctx.timeZone);
  const end = localParts(endUtc, ctx.timeZone);
  const pay = calcShift({
    startUtc,
    endUtc,
    timeZone: ctx.timeZone,
    rules: rulesOn(ctx.history, start.date),
    isHoliday: ctx.holidays.isHoliday,
    holidayOverride: row.holidayOverride,
    breakOverrideMinutes: row.breakOverrideMinutes,
  });
  const holidayDate = pay.segments.find((s) => s.tag === 'holiday')?.date;
  return {
    id: row.id,
    source: row.source,
    title: row.title,
    startUtc,
    endUtc,
    localDate: start.date,
    localStartMin: start.minutes,
    localEndMin: end.minutes,
    holidayOverride: row.holidayOverride,
    breakOverrideMinutes: row.breakOverrideMinutes,
    editedByUser: row.editedByUser,
    removedFromFeed: row.removedFromFeed,
    conflict:
      row.conflictStartUtc && row.conflictEndUtc && !row.conflictDismissed
        ? { startUtc: row.conflictStartUtc.getTime(), endUtc: row.conflictEndUtc.getTime() }
        : null,
    holidayName: holidayDate ? (ctx.holidays.nameOf(holidayDate) ?? 'Public holiday') : null,
    updatedAt: row.updatedAt.getTime(),
    pay,
  };
}

/** Shifts whose local start date falls in [from, to). */
async function shiftsBetween(db: Db, userId: string, from: string, to: string, timeZone: string) {
  return db
    .select()
    .from(schema.shifts)
    .where(
      and(
        eq(schema.shifts.userId, userId),
        eq(schema.shifts.deletedByUser, false),
        gte(schema.shifts.startUtc, new Date(zonedToUtc(from, 0, timeZone))),
        lt(schema.shifts.startUtc, new Date(zonedToUtc(to, 0, timeZone))),
      ),
    )
    .orderBy(asc(schema.shifts.startUtc));
}

export type PeriodSummary = {
  period: Period;
  pay: number;
  paidMinutes: number;
  shiftCount: number;
};

function summarise(period: Period, views: ShiftView[]): PeriodSummary {
  const counted = views.filter((v) => !v.removedFromFeed);
  return {
    period,
    pay: Math.round(counted.reduce((n, v) => n + v.pay.subtotal, 0) * 100) / 100,
    paidMinutes: counted.reduce((n, v) => n + v.pay.paidMinutes, 0),
    shiftCount: counted.length,
  };
}

export function todayIn(timeZone: string) {
  return localParts(Date.now(), timeZone).date;
}

export async function getPeriodShifts(userId: string, anchorDate?: string) {
  const db = await getDb();
  const ctx = await loadContext(db, userId);
  const current = latest(ctx.history);
  const cfg = periodConfig(current);
  const period = periodFor(anchorDate ?? todayIn(ctx.timeZone), cfg);
  const rows = await shiftsBetween(db, userId, period.start, period.end, ctx.timeZone);
  const views = rows.map((r) => toView(r, ctx));
  return { period, cfg, settings: current, views, summary: summarise(period, views) };
}

export type Breakdown = { day: number; weekend: number; evening: number; night: number; holiday: number };

export async function getDashboard(userId: string, anchorDate?: string) {
  const db = await getDb();
  const ctx = await loadContext(db, userId);
  const current = latest(ctx.history);
  const cfg = periodConfig(current);
  const today = todayIn(ctx.timeZone);
  const focus = anchorDate ?? today;

  const HISTORY = cfg.type === 'weekly' ? 12 : 8;
  const periods = recentPeriods(focus, cfg, HISTORY);
  const first = periods[0];
  const rows = await shiftsBetween(db, userId, first.start, periods.at(-1)!.end, ctx.timeZone);
  const views = rows.map((r) => toView(r, ctx));

  const history = periods.map((p) =>
    summarise(
      p,
      views.filter((v) => v.localDate >= p.start && v.localDate < p.end),
    ),
  );
  const currentSummary = history.at(-1)!;
  const previousSummary = history.at(-2) ?? null;
  const currentViews = views.filter((v) => v.localDate >= currentSummary.period.start && v.localDate < currentSummary.period.end);

  const breakdown: Breakdown = { day: 0, weekend: 0, evening: 0, night: 0, holiday: 0 };
  for (const v of currentViews) {
    if (v.removedFromFeed) continue;
    for (const s of v.pay.segments) {
      const key = s.tag === 'day' && (s.dow === 0 || s.dow === 6) ? 'weekend' : s.tag;
      breakdown[key] += s.amount;
    }
  }

  const now = Date.now();
  const [nextRow] = await db
    .select()
    .from(schema.shifts)
    .where(
      and(
        eq(schema.shifts.userId, userId),
        gte(schema.shifts.startUtc, new Date(now)),
        eq(schema.shifts.removedFromFeed, false),
        eq(schema.shifts.deletedByUser, false),
      ),
    )
    .orderBy(asc(schema.shifts.startUtc))
    .limit(1);

  const recentRows = await db
    .select()
    .from(schema.shifts)
    .where(and(eq(schema.shifts.userId, userId), eq(schema.shifts.deletedByUser, false)))
    .orderBy(desc(schema.shifts.updatedAt))
    .limit(6);

  const [calendar] = await db.select().from(schema.calendarSources).where(eq(schema.calendarSources.userId, userId));

  return {
    today,
    localHour: Math.floor(localParts(now, ctx.timeZone).minutes / 60),
    settings: current,
    cfg,
    current: currentSummary,
    previous: previousSummary,
    history,
    breakdown,
    currentViews,
    nextShift: nextRow ? toView(nextRow, ctx) : null,
    recent: recentRows.map((r) => toView(r, ctx)),
    calendar: calendar
      ? {
          connected: true,
          lastSyncedAt: calendar.lastSyncedAt?.getTime() ?? null,
          lastStatus: calendar.lastStatus,
          lastError: calendar.lastError,
          lastSummary: calendar.lastSummary,
        }
      : { connected: false as const },
  };
}

const STALE_AFTER_MS = 36 * 3_600_000;

export async function getCalendarStatus(userId: string) {
  const db = await getDb();
  const [row] = await db.select().from(schema.calendarSources).where(eq(schema.calendarSources.userId, userId));
  if (!row) return null;
  return {
    stale: !row.lastSyncedAt || Date.now() - row.lastSyncedAt.getTime() > STALE_AFTER_MS,
    lastSyncedAt: row.lastSyncedAt?.getTime() ?? null,
    lastStatus: row.lastStatus,
    lastError: row.lastError,
    lastSummary: row.lastSummary,
  };
}

export async function getSettingsPage(userId: string, includeInvites: boolean) {
  const db = await getDb();
  const history = await getSettingsHistory(db, userId);
  const current = latest(history);
  const today = todayIn(current.timeZone);
  const [calendar] = await db.select().from(schema.calendarSources).where(eq(schema.calendarSources.userId, userId));
  const custom = await db
    .select()
    .from(schema.customHolidays)
    .where(eq(schema.customHolidays.userId, userId))
    .orderBy(asc(schema.customHolidays.date));
  const upcoming = await db
    .select()
    .from(schema.publicHolidays)
    .where(and(eq(schema.publicHolidays.state, current.state), gte(schema.publicHolidays.date, today)))
    .orderBy(asc(schema.publicHolidays.date))
    .limit(8);
  const invites = includeInvites
    ? await db.select().from(schema.invites).where(eq(schema.invites.createdBy, userId)).orderBy(desc(schema.invites.createdAt))
    : [];
  return {
    settings: current,
    rateVersions: history.map((h) => h.effectiveFrom),
    today,
    calendar: calendar
      ? {
          lastSyncedAt: calendar.lastSyncedAt?.getTime() ?? null,
          lastStatus: calendar.lastStatus,
          lastError: calendar.lastError,
          lastSummary: calendar.lastSummary,
        }
      : null,
    custom: custom.map((c) => ({ date: c.date, name: c.name })),
    upcoming: upcoming.map((h) => ({ date: h.date, name: h.name, regional: h.regional })),
    invites: invites.map((i) => ({
      token: i.token,
      email: i.email,
      status: i.usedAt ? ('joined' as const) : i.expiresAt.getTime() < Date.now() ? ('expired' as const) : ('pending' as const),
    })),
  };
}
