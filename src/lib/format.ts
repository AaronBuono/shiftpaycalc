import { DAY_NAMES, dateToUtcMidnight, minutesLabel } from './pay/dates';
import type { SyncSummary } from './sync-types';

export { minutesLabel };

const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
const moneyWhole = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });

export function formatMoney(n: number) {
  return money.format(n);
}

export function formatMoneyShort(n: number) {
  return moneyWhole.format(n);
}

export function formatHours(minutes: number) {
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(2).replace(/0$/, '')}h`;
}

/** 'Mon 5 Oct' from a YYYY-MM-DD local date. */
export function formatDate(date: string, opts: { year?: boolean; weekday?: boolean } = {}) {
  return new Intl.DateTimeFormat('en-AU', {
    weekday: opts.weekday === false ? undefined : 'short',
    day: 'numeric',
    month: 'short',
    year: opts.year ? 'numeric' : undefined,
    timeZone: 'UTC',
  }).format(dateToUtcMidnight(date));
}

export function dayName(dow: number) {
  return DAY_NAMES[dow];
}

/** '28 Sep – 4 Oct' for a [start, end) period. */
export function formatPeriod(start: string, endExclusive: string) {
  const last = new Date(dateToUtcMidnight(endExclusive) - 86_400_000).toISOString().slice(0, 10);
  return `${formatDate(start, { weekday: false })} – ${formatDate(last, { weekday: false })}`;
}

export function formatRelative(ms: number, now = Date.now()) {
  const diff = Math.round((now - ms) / 60_000);
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff} min ago`;
  const h = Math.round(diff / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

export function syncSummaryText(s: SyncSummary) {
  const parts = [
    s.added && `${s.added} new`,
    s.updated && `${s.updated} updated`,
    s.removed && `${s.removed} removed`,
    s.conflicts && `${s.conflicts} need review`,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'No changes';
}

/** '6pm' / '6:30pm' for an instant in a time zone. */
export function formatTimeInZone(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone, hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }).formatToParts(ms);
  const h = Number(parts.find((p) => p.type === 'hour')?.value);
  const m = Number(parts.find((p) => p.type === 'minute')?.value);
  return minutesLabel(h * 60 + m);
}

export const TAG_LABEL = { day: 'Day', evening: 'Evening', night: 'Night', holiday: 'Holiday' } as const;
