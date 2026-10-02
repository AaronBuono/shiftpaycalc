import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { addDays, zonedToUtc } from './dates';
import { calcShift, type HolidayOverride } from './engine';
import { DEFAULT_RULES } from './rules';

const TZ = 'Australia/Melbourne';

/** Build a shift from local Melbourne date + "HH:MM" times, like the old UI. */
function shift(date: string, start: string, end: string, opts: { holidays?: string[]; holidayOverride?: HolidayOverride; breakOverrideMinutes?: number | null } = {}) {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const endDate = toMin(end) <= toMin(start) ? addDays(date, 1) : date;
  const holidays = new Set(opts.holidays ?? []);
  return calcShift({
    startUtc: zonedToUtc(date, toMin(start), TZ),
    endUtc: zonedToUtc(endDate, toMin(end), TZ),
    timeZone: TZ,
    rules: DEFAULT_RULES,
    isHoliday: (d) => holidays.has(d),
    holidayOverride: opts.holidayOverride,
    breakOverrideMinutes: opts.breakOverrideMinutes,
  });
}

// ---- The original calculator, loaded straight from the HTML file ----
type OldResult = { subtotal: number; totalSpan: number; paidHours: number; breakHours: number };
const oldCalcShift: (date: string, start: string, end: string, isHoliday: boolean) => OldResult = (() => {
  const html = readFileSync(join(__dirname, '../../../shift-pay-calculator.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  const grab = (re: RegExp) => script.match(re)![0];
  const src = [
    grab(/const RATES = \{[\s\S]*?\n\};/),
    grab(/function parseTimeToHours[\s\S]*?\n\}/),
    grab(/function addDays[\s\S]*?\n\}/),
    grab(/function calcShift[\s\S]*?\n\}/),
    'return calcShift;',
  ].join('\n');
  return new Function(src)();
})();

describe('parity with the original calculator (no DST change)', () => {
  // June 2026 is AEST all month, so the old wall-clock maths is valid.
  const dates = ['2026-06-01', '2026-06-05', '2026-06-06', '2026-06-07', '2026-06-10', '2026-06-12', '2026-06-13'];
  const times: string[] = [];
  for (let m = 0; m < 1440; m += 45) times.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);

  it('matches subtotal and hours for every start/end combination', () => {
    let checked = 0;
    for (const date of dates) {
      for (const start of times) {
        for (const end of times) {
          if (start === end) continue; // old code treated this as 24h; now rejected
          for (const holiday of [false, true]) {
            const oldR = oldCalcShift(date, start, end, holiday);
            const newR = shift(date, start, end, { holidayOverride: holiday ? 'yes' : 'auto' });
            // Within a cent: the old file summed floats, so exact half-cents like
            // 829.325 came out as 829.3249999 and rounded down.
            expect(Math.abs(newR.subtotal - oldR.subtotal), `${date} ${start}-${end} PH=${holiday}`).toBeLessThanOrEqual(0.0051);
            expect(newR.totalMinutes / 60).toBeCloseTo(oldR.totalSpan, 6);
            expect(newR.paidMinutes / 60).toBeCloseTo(oldR.paidHours, 6);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(10_000);
  });
});

describe('pay rules', () => {
  it('Friday 5pm–1am splits at midnight, evening loading Fri only, Saturday has no night loading', () => {
    const r = shift('2026-06-05', '17:00', '01:00');
    expect(r.segments.map((s) => [s.date, s.tag, s.rate, s.minutes])).toEqual([
      ['2026-06-05', 'day', 33.85, 120],
      ['2026-06-05', 'evening', 36.8, 300],
      ['2026-06-06', 'day', 40.62, 30], // 30 min of the Saturday hour cut by the break
    ]);
    expect(r.breakMinutes).toBe(30);
    expect(r.subtotal).toBeCloseTo(2 * 33.85 + 5 * 36.8 + 0.5 * 40.62, 2);
  });

  it('Thursday night into Friday gets night loading after midnight', () => {
    const r = shift('2026-06-04', '22:00', '04:00');
    expect(r.segments.map((s) => s.tag)).toEqual(['evening', 'night']);
    expect(r.segments[1].rate).toBeCloseTo(33.85 + 4.22, 2);
  });

  it('exactly 6h gets no break; 6h15 does', () => {
    expect(shift('2026-06-02', '09:00', '15:00').breakMinutes).toBe(0);
    expect(shift('2026-06-02', '09:00', '15:15').breakMinutes).toBe(30);
  });

  it('break override replaces the default', () => {
    expect(shift('2026-06-02', '09:00', '17:00', { breakOverrideMinutes: 0 }).paidMinutes).toBe(480);
    expect(shift('2026-06-02', '09:00', '12:00', { breakOverrideMinutes: 15 }).paidMinutes).toBe(165);
  });

  it('rounds start/end to the nearest 15 minutes', () => {
    const toMs = (min: number) => zonedToUtc('2026-06-02', min, TZ);
    const r = calcShift({ startUtc: toMs(9 * 60 + 7), endUtc: toMs(12 * 60 + 7), timeZone: TZ, rules: DEFAULT_RULES, isHoliday: () => false });
    expect(r.totalMinutes).toBe(180);
  });

  it('rejects zero-length and 24h+ shifts', () => {
    const t = zonedToUtc('2026-06-02', 9 * 60, TZ);
    const base = { timeZone: TZ, rules: DEFAULT_RULES, isHoliday: () => false };
    expect(() => calcShift({ ...base, startUtc: t, endUtc: t })).toThrow();
    expect(() => calcShift({ ...base, startUtc: t, endUtc: t + 24 * 3_600_000 })).toThrow();
  });
});

describe('public holidays (per calendar day)', () => {
  it('shift running into a holiday: only the part after midnight is 250%', () => {
    // Melbourne Cup Tue 3 Nov 2026; shift Mon 2 Nov 8pm – Tue 3 Nov 2am
    const r = shift('2026-11-02', '20:00', '02:00', { holidays: ['2026-11-03'] });
    expect(r.segments.map((s) => [s.date, s.tag, s.rate])).toEqual([
      ['2026-11-02', 'evening', 36.8],
      ['2026-11-03', 'holiday', 67.7],
    ]);
  });

  it('shift starting on a holiday: the part after midnight reverts to normal rates', () => {
    const r = shift('2026-11-03', '20:00', '02:00', { holidays: ['2026-11-03'] });
    expect(r.segments.map((s) => [s.date, s.tag])).toEqual([
      ['2026-11-03', 'holiday'],
      ['2026-11-04', 'night'],
    ]);
  });

  it("'no' override ignores auto-detected holidays", () => {
    const r = shift('2026-11-03', '09:00', '12:00', { holidays: ['2026-11-03'], holidayOverride: 'no' });
    expect(r.segments.every((s) => s.tag === 'day')).toBe(true);
  });
});

describe('daylight saving (Australia/Melbourne)', () => {
  it('clocks forward Sun 4 Oct 2026: Sat 10pm – Sun 6am is 7h worked', () => {
    const r = shift('2026-10-03', '22:00', '06:00');
    expect(r.totalMinutes).toBe(7 * 60);
    expect(r.breakMinutes).toBe(30);
    expect(r.paidMinutes).toBe(6.5 * 60);
    // Saturday 2h + Sunday 5h (12–2am and 3–6am local), less 30 min break off the end
    const sunday = r.segments.filter((s) => s.date === '2026-10-04').reduce((n, s) => n + s.minutes, 0);
    expect(sunday).toBe(4.5 * 60);
    expect(r.subtotal).toBeCloseTo(2 * 40.62 + 4.5 * 47.39, 2);
  });

  it('clocks back Sun 4 Apr 2027: Sat 10pm – Sun 6am is 9h worked', () => {
    const r = shift('2027-04-03', '22:00', '06:00');
    expect(r.totalMinutes).toBe(9 * 60);
    expect(r.paidMinutes).toBe(8.5 * 60);
  });

  it('weekday shift across the change keeps loadings on the local clock', () => {
    // Mon 5 Oct 2026, the day after the change: 6pm–11pm → 1h day + 4h evening
    const r = shift('2026-10-05', '18:00', '23:00');
    expect(r.segments.map((s) => [s.tag, s.minutes])).toEqual([
      ['day', 60],
      ['evening', 240],
    ]);
  });
});
