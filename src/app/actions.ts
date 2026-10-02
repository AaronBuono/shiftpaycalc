'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';

import { getDb, schema } from '@/db';
import { isAdminEmail, requireUser } from '@/lib/auth';
import { encryptSecret } from '@/lib/crypto';
import { EARLIEST_EFFECTIVE, getSettingsHistory, latest, todayIn } from '@/lib/data';
import { normaliseFeedUrl } from '@/lib/ics';
import { addDays, zonedToUtc } from '@/lib/pay/dates';
import { ShiftValidationError, validateShiftTimes } from '@/lib/pay/engine';
import { validateRules, type PayRules } from '@/lib/pay/rules';
import { SUPPORTED_STATES } from '@/lib/holidays/data';
import { syncUser, type SyncSummary } from '@/lib/sync';

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

function refresh() {
  revalidatePath('/', 'layout');
}

function fail(err: unknown): { ok: false; error: string } {
  unstable_rethrow(err); // let requireUser()'s redirect to /login through
  if (err instanceof ShiftValidationError) return { ok: false, error: err.message };
  if (err instanceof Error && /^[A-Z]/.test(err.message)) return { ok: false, error: err.message };
  return { ok: false, error: 'Something went wrong.' };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ---------- Shifts ----------

export type ShiftForm = {
  id?: string;
  date: string; // local start date
  start: string; // HH:MM, 24h
  end: string; // HH:MM; at or before start means it ends the next day
  holidayOverride: 'auto' | 'yes' | 'no';
  breakOverrideMinutes: number | null;
};

export async function saveShift(form: ShiftForm): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!DATE_RE.test(form.date) || !TIME_RE.test(form.start) || !TIME_RE.test(form.end)) {
      throw new ShiftValidationError('Enter a date and start/end times.');
    }
    if (!['auto', 'yes', 'no'].includes(form.holidayOverride)) throw new ShiftValidationError('Invalid holiday option.');
    const br = form.breakOverrideMinutes;
    if (br !== null && !(Number.isInteger(br) && br >= 0 && br <= 120 && br % 15 === 0)) {
      throw new ShiftValidationError('Break must be 0–120 minutes in 15-minute steps.');
    }

    const db = await getDb();
    const { timeZone } = latest(await getSettingsHistory(db, user.id));
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    const startMin = toMin(form.start);
    const endMin = toMin(form.end);
    const startUtc = zonedToUtc(form.date, startMin, timeZone);
    const endUtc = zonedToUtc(endMin <= startMin ? addDays(form.date, 1) : form.date, endMin, timeZone);
    validateShiftTimes(startUtc, endUtc);

    const values = {
      startUtc: new Date(startUtc),
      endUtc: new Date(endUtc),
      holidayOverride: form.holidayOverride,
      breakOverrideMinutes: br,
      updatedAt: new Date(),
    };

    if (form.id) {
      const [row] = await db
        .select()
        .from(schema.shifts)
        .where(and(eq(schema.shifts.id, form.id), eq(schema.shifts.userId, user.id)));
      if (!row) throw new ShiftValidationError('Shift not found.');
      const timesChanged = row.startUtc.getTime() !== startUtc || row.endUtc.getTime() !== endUtc;
      await db
        .update(schema.shifts)
        .set({ ...values, editedByUser: row.editedByUser || (row.source === 'synced' && timesChanged) })
        .where(eq(schema.shifts.id, row.id));
    } else {
      await db.insert(schema.shifts).values({ id: crypto.randomUUID(), userId: user.id, source: 'manual', ...values });
    }
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteShift(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const db = await getDb();
    const [row] = await db
      .select()
      .from(schema.shifts)
      .where(and(eq(schema.shifts.id, id), eq(schema.shifts.userId, user.id)));
    if (!row) return { ok: true };
    if (row.source === 'manual') {
      await db.delete(schema.shifts).where(eq(schema.shifts.id, row.id));
    } else {
      // Keep synced rows so the next sync doesn't re-add them.
      await db.update(schema.shifts).set({ deletedByUser: true, updatedAt: new Date() }).where(eq(schema.shifts.id, row.id));
    }
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Resolve a sync conflict: 'roster' takes the feed's times, 'mine' keeps the hand edit. */
export async function resolveConflict(id: string, choice: 'roster' | 'mine'): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const db = await getDb();
    const [row] = await db
      .select()
      .from(schema.shifts)
      .where(and(eq(schema.shifts.id, id), eq(schema.shifts.userId, user.id)));
    if (!row?.conflictStartUtc || !row.conflictEndUtc) return { ok: true };
    if (choice === 'roster') {
      await db
        .update(schema.shifts)
        .set({
          startUtc: row.conflictStartUtc,
          endUtc: row.conflictEndUtc,
          editedByUser: false,
          conflictStartUtc: null,
          conflictEndUtc: null,
          conflictDismissed: false,
          updatedAt: new Date(),
        })
        .where(eq(schema.shifts.id, row.id));
    } else {
      // Remember the dismissed feed times so the next sync doesn't re-flag them.
      await db.update(schema.shifts).set({ conflictDismissed: true, updatedAt: new Date() }).where(eq(schema.shifts.id, row.id));
    }
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---------- Calendar sync ----------

export async function syncNow(): Promise<ActionResult<SyncSummary>> {
  try {
    const user = await requireUser();
    const summary = await syncUser(await getDb(), user.id);
    refresh();
    return { ok: true, data: summary };
  } catch (err) {
    refresh();
    return fail(err);
  }
}

export async function saveCalendarUrl(raw: string): Promise<ActionResult<SyncSummary>> {
  try {
    const user = await requireUser();
    let url: string;
    try {
      url = normaliseFeedUrl(raw);
    } catch {
      throw new Error('That doesn’t look like a calendar link. It should start with webcal:// or https://');
    }
    const db = await getDb();
    const encryptedUrl = await encryptSecret(url);
    await db
      .insert(schema.calendarSources)
      .values({ userId: user.id, encryptedUrl })
      .onConflictDoUpdate({
        target: schema.calendarSources.userId,
        set: { encryptedUrl, lastStatus: null, lastError: null, lastSummary: null, lastSyncedAt: null },
      });
    try {
      const summary = await syncUser(db, user.id);
      refresh();
      return { ok: true, data: summary };
    } catch (err) {
      refresh();
      return { ok: false, error: `Saved, but the first sync failed: ${err instanceof Error ? err.message : 'unknown error'}` };
    }
  } catch (err) {
    return fail(err);
  }
}

export async function disconnectCalendar(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const db = await getDb();
    await db.delete(schema.calendarSources).where(eq(schema.calendarSources.userId, user.id));
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---------- Settings ----------

export type SettingsForm = {
  rules: PayRules;
  /** true: new rates apply from today; past shifts keep the old ones. false: rewrite history. */
  keepPastRates: boolean;
  timeZone: string;
  state: string;
  melbourneCup: boolean;
  periodType: 'weekly' | 'fortnightly';
  periodStartDow: number;
  periodAnchorDate: string;
};

export async function saveSettings(form: SettingsForm): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const errors = validateRules(form.rules);
    try {
      new Intl.DateTimeFormat('en', { timeZone: form.timeZone });
    } catch {
      errors.push('Unknown time zone.');
    }
    if (!(SUPPORTED_STATES as readonly string[]).includes(form.state)) errors.push('Unsupported state.');
    if (!['weekly', 'fortnightly'].includes(form.periodType)) errors.push('Invalid pay period.');
    if (!(Number.isInteger(form.periodStartDow) && form.periodStartDow >= 0 && form.periodStartDow <= 6)) {
      errors.push('Invalid week start day.');
    }
    if (!DATE_RE.test(form.periodAnchorDate)) errors.push('Invalid fortnight start date.');
    if (errors.length) return { ok: false, error: errors.join(' ') };

    const rules: PayRules = {
      baseRate: form.rules.baseRate,
      dayRates: form.rules.dayRates.map(Number),
      publicHolidayRate: form.rules.publicHolidayRate,
      loadings: form.rules.loadings.map((l) => ({ ...l, days: [...new Set(l.days)].sort() })),
      breakMinutes: form.rules.breakMinutes,
      breakThresholdMinutes: form.rules.breakThresholdMinutes,
    };
    const prefs = {
      timeZone: form.timeZone,
      state: form.state,
      melbourneCup: form.melbourneCup,
      periodType: form.periodType,
      periodStartDow: form.periodStartDow,
      periodAnchorDate: form.periodAnchorDate,
      updatedAt: new Date(),
    };

    const db = await getDb();
    const history = await getSettingsHistory(db, user.id);
    const current = latest(history);
    const ratesChanged = JSON.stringify(current.rules) !== JSON.stringify(rules);

    if (!form.keepPastRates && ratesChanged) {
      // Rewrite history: one row, effective for all shifts.
      await db.delete(schema.settings).where(eq(schema.settings.userId, user.id));
      await db.insert(schema.settings).values({ id: crypto.randomUUID(), userId: user.id, effectiveFrom: EARLIEST_EFFECTIVE, rules, ...prefs });
    } else if (ratesChanged) {
      const today = todayIn(form.timeZone);
      await db
        .insert(schema.settings)
        .values({ id: crypto.randomUUID(), userId: user.id, effectiveFrom: today, rules, ...prefs })
        .onConflictDoUpdate({ target: [schema.settings.userId, schema.settings.effectiveFrom], set: { rules, ...prefs } });
    } else {
      await db.update(schema.settings).set(prefs).where(eq(schema.settings.id, current.id));
    }
    refresh();
    return { ok: true, message: ratesChanged && form.keepPastRates ? 'New rates apply from today.' : undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function addCustomHoliday(date: string, name: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!DATE_RE.test(date)) return { ok: false, error: 'Pick a date.' };
    const clean = name.trim().slice(0, 80) || 'Local holiday';
    const db = await getDb();
    await db
      .insert(schema.customHolidays)
      .values({ userId: user.id, date, name: clean })
      .onConflictDoUpdate({ target: [schema.customHolidays.userId, schema.customHolidays.date], set: { name: clean } });
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function removeCustomHoliday(date: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const db = await getDb();
    await db
      .delete(schema.customHolidays)
      .where(and(eq(schema.customHolidays.userId, user.id), eq(schema.customHolidays.date, date)));
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---------- Invites (admin only) ----------

const INVITE_DAYS = 14;

export async function createInvite(email: string): Promise<ActionResult<{ token: string }>> {
  try {
    const user = await requireUser();
    if (!isAdminEmail(user.email)) return { ok: false, error: 'Only the owner can send invites.' };
    const clean = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return { ok: false, error: 'Enter a valid email.' };
    const db = await getDb();
    const [existingUser] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, clean));
    if (existingUser) return { ok: false, error: 'That person already has an account.' };
    const token = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('base64url');
    await db.insert(schema.invites).values({
      token,
      email: clean,
      createdBy: user.id,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
    });
    refresh();
    return { ok: true, data: { token } };
  } catch (err) {
    return fail(err);
  }
}

export async function revokeInvite(token: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!isAdminEmail(user.email)) return { ok: false, error: 'Only the owner can manage invites.' };
    const db = await getDb();
    await db.delete(schema.invites).where(and(eq(schema.invites.token, token), isNull(schema.invites.usedAt)));
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
