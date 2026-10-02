// Port of calcShift() from shift-pay-calculator.html, reworked to be correct
// across daylight-saving changes.
//
// The shift is walked in 15-minute slices of real (UTC) time. Each slice is
// classified by its *local* wall-clock date and time — so the midnight split,
// the 7pm/7am loading edges and the day-of-week rate all follow the local
// clock — while paid hours come from real elapsed time. On the night clocks go
// forward, a 10pm–6am shift is therefore 7h worked, and 9h when they go back.
//
// Pay is only calculated in 15-minute blocks, so start/end are rounded to the
// nearest quarter hour first (Humanforce shifts are already on :00/:15/:30/:45).

import { localParts, MINUTE, type LocalParts } from './dates';
import type { LoadingKind, PayRules } from './rules';

export type SegmentTag = 'day' | LoadingKind | 'holiday';

export type Segment = {
  date: string; // local calendar date
  dow: number;
  tag: SegmentTag;
  rate: number;
  minutes: number;
  /** Local wall-clock minutes since midnight of `date`, for display. */
  fromMin: number;
  toMin: number;
  amount: number;
};

export type HolidayOverride = 'auto' | 'yes' | 'no';

export type ShiftInput = {
  startUtc: number;
  endUtc: number;
  timeZone: string;
  rules: PayRules;
  /** Is this local date a public holiday for the user? */
  isHoliday: (date: string) => boolean;
  /**
   * 'auto' uses isHoliday for every day the shift touches. 'yes' forces the
   * shift's start date to be a holiday (like the old manual checkbox), on top
   * of any auto-detected days. 'no' ignores holidays entirely.
   */
  holidayOverride?: HolidayOverride;
  /** Minutes of unpaid break; null/undefined uses the rules' default. */
  breakOverrideMinutes?: number | null;
};

export type ShiftResult = {
  segments: Segment[];
  /** Real elapsed minutes from start to end. */
  totalMinutes: number;
  breakMinutes: number;
  breakDeduction: number;
  paidMinutes: number;
  gross: number; // before break
  subtotal: number; // after break
  touchesHoliday: boolean;
};

const SLICE = 15 * MINUTE;
const MAX_SHIFT = 24 * 60 * MINUTE;

export function roundToQuarterHour(ms: number) {
  return Math.round(ms / SLICE) * SLICE;
}

export class ShiftValidationError extends Error {}

export function validateShiftTimes(startUtc: number, endUtc: number) {
  const s = roundToQuarterHour(startUtc);
  const e = roundToQuarterHour(endUtc);
  if (!Number.isFinite(s) || !Number.isFinite(e)) throw new ShiftValidationError('Invalid shift times.');
  if (e <= s) throw new ShiftValidationError('Shift must end after it starts.');
  if (e - s >= MAX_SHIFT) throw new ShiftValidationError('Shifts must be shorter than 24 hours.');
}

type Slice = { local: LocalParts; tag: SegmentTag; rate: number };

export function calcShift(input: ShiftInput): ShiftResult {
  const { rules, timeZone } = input;
  validateShiftTimes(input.startUtc, input.endUtc);
  const start = roundToQuarterHour(input.startUtc);
  const end = roundToQuarterHour(input.endUtc);
  const override = input.holidayOverride ?? 'auto';
  const startDate = localParts(start, timeZone).date;

  const holidayCache = new Map<string, boolean>();
  const isHolidayDate = (date: string) => {
    if (override === 'no') return false;
    if (override === 'yes' && date === startDate) return true;
    let v = holidayCache.get(date);
    if (v === undefined) {
      v = input.isHoliday(date);
      holidayCache.set(date, v);
    }
    return v;
  };

  const slices: Slice[] = [];
  for (let t = start; t < end; t += SLICE) {
    const local = localParts(t, timeZone);
    if (isHolidayDate(local.date)) {
      slices.push({ local, tag: 'holiday', rate: rules.publicHolidayRate });
      continue;
    }
    const base = rules.dayRates[local.dow];
    const loading = rules.loadings.find(
      (l) => l.days.includes(local.dow) && local.minutes >= l.startMin && local.minutes < l.endMin,
    );
    slices.push({
      local,
      tag: loading ? loading.kind : 'day',
      rate: roundCents(base + (loading?.amount ?? 0)),
    });
  }

  const totalMinutes = slices.length * 15;

  // Unpaid break, cut from the end of the shift since exact timing isn't tracked.
  const breakMinutes = Math.min(
    totalMinutes,
    input.breakOverrideMinutes ?? (totalMinutes > rules.breakThresholdMinutes ? rules.breakMinutes : 0),
  );
  // Money is summed exactly in integer cents-per-quarter-hour (a slice earns
  // rate/4), then rounded half-up to the cent once at the end.
  const quarterCents = (list: Slice[]) => list.reduce((sum, s) => sum + Math.round(s.rate * 100), 0);
  const toDollars = (qc: number) => Math.round(qc / 4) / 100;
  const grossQc = quarterCents(slices);
  const cut = slices.splice(slices.length - Math.round(breakMinutes / 15));
  const breakQc = quarterCents(cut);

  const segments: (Segment & { qc: number })[] = [];
  for (const s of slices) {
    const last = segments.at(-1);
    const qc = Math.round(s.rate * 100);
    if (last && last.date === s.local.date && last.tag === s.tag && last.rate === s.rate && last.toMin === s.local.minutes) {
      last.minutes += 15;
      last.toMin += 15;
      last.qc += qc;
    } else {
      segments.push({
        date: s.local.date,
        dow: s.local.dow,
        tag: s.tag,
        rate: s.rate,
        minutes: 15,
        fromMin: s.local.minutes,
        toMin: s.local.minutes + 15,
        amount: 0,
        qc,
      });
    }
  }

  return {
    segments: segments.map(({ qc, ...seg }) => ({ ...seg, amount: toDollars(qc) })),
    totalMinutes,
    breakMinutes,
    breakDeduction: toDollars(breakQc),
    paidMinutes: totalMinutes - breakMinutes,
    gross: toDollars(grossQc),
    subtotal: toDollars(grossQc - breakQc),
    touchesHoliday: segments.some((s) => s.tag === 'holiday') || cut.some((s) => s.tag === 'holiday'),
  };
}

export function roundCents(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
