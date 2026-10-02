// Calendar-date and time-zone helpers. Dates are plain 'YYYY-MM-DD' strings
// (a local calendar day, no time zone); instants are UTC epoch milliseconds.

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export type LocalParts = {
  date: string; // YYYY-MM-DD
  dow: number; // 0=Sun..6=Sat
  minutes: number; // minutes since local midnight
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string) {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** Wall-clock date/time of a UTC instant in the given IANA time zone. */
export function localParts(utcMs: number, timeZone: string): LocalParts {
  const parts: Record<string, string> = {};
  for (const p of formatterFor(timeZone).formatToParts(utcMs)) parts[p.type] = p.value;
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    date,
    dow: dayOfWeek(date),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** Offset (local - UTC) in ms for a time zone at a given instant. */
function tzOffset(utcMs: number, timeZone: string) {
  const { date, minutes } = localParts(utcMs, timeZone);
  const asUtc = dateToUtcMidnight(date) + minutes * MINUTE;
  // localParts drops seconds, so compare at minute precision.
  return asUtc - Math.floor(utcMs / MINUTE) * MINUTE;
}

/**
 * The UTC instant for a local wall-clock time. A time skipped by a DST jump
 * (e.g. 2:30am on the spring-forward night) resolves to the instant just after
 * the jump; an ambiguous fall-back time resolves to its first occurrence.
 */
export function zonedToUtc(date: string, minutes: number, timeZone: string): number {
  const guess = dateToUtcMidnight(date) + minutes * MINUTE;
  const off1 = tzOffset(guess - 12 * HOUR, timeZone);
  const off2 = tzOffset(guess + 12 * HOUR, timeZone);
  // Try the earlier offset first so ambiguous times map to the first occurrence.
  for (const off of [Math.max(off1, off2), Math.min(off1, off2)]) {
    const candidate = guess - off;
    const back = localParts(candidate, timeZone);
    if (back.date === date && back.minutes === minutes) return candidate;
  }
  // Nonexistent local time (inside a spring-forward gap).
  return guess - Math.min(off1, off2);
}

export function dateToUtcMidnight(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function utcMidnightToDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  return utcMidnightToDate(dateToUtcMidnight(date) + n * 24 * HOUR);
}

export function dayOfWeek(date: string): number {
  return new Date(dateToUtcMidnight(date)).getUTCDay();
}

export function daysBetween(from: string, to: string): number {
  return Math.round((dateToUtcMidnight(to) - dateToUtcMidnight(from)) / (24 * HOUR));
}

/** "7pm", "7:30pm", "12am" from minutes since midnight. */
export function minutesLabel(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  const period = hh < 12 ? 'am' : 'pm';
  let h12 = hh % 12;
  if (h12 === 0) h12 = 12;
  return mm === 0 ? `${h12}${period}` : `${h12}:${String(mm).padStart(2, '0')}${period}`;
}
