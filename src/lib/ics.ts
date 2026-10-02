// Minimal iCalendar (RFC 5545) VEVENT parser for the Humanforce roster feed.
// Only what a roster needs: UID, start, end, summary, status. Times are
// converted to UTC instants; floating times use the user's time zone.

import { zonedToUtc } from './pay/dates';

export type IcsEvent = {
  uid: string;
  startUtc: number;
  endUtc: number;
  summary: string | null;
  cancelled: boolean;
};

type Prop = { name: string; params: Record<string, string>; value: string };

const WINDOWS_ZONES: Record<string, string> = {
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'E. Australia Standard Time': 'Australia/Brisbane',
  'Cen. Australia Standard Time': 'Australia/Adelaide',
  'AUS Central Standard Time': 'Australia/Darwin',
  'W. Australia Standard Time': 'Australia/Perth',
  'Tasmania Standard Time': 'Australia/Hobart',
  'New Zealand Standard Time': 'Pacific/Auckland',
  UTC: 'UTC',
};

function isValidZone(tz: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function resolveZone(tzid: string | undefined, fallback: string): string {
  if (!tzid) return fallback;
  const clean = tzid.replace(/^"|"$/g, '');
  if (WINDOWS_ZONES[clean]) return WINDOWS_ZONES[clean];
  if (isValidZone(clean)) return clean;
  // Some generators prefix a path, e.g. /citadel.org/20190101_1/Australia/Melbourne
  const tail = clean.split('/').slice(-2).join('/');
  if (isValidZone(tail)) return tail;
  return fallback;
}

function unfold(text: string): string[] {
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
}

function parseLine(line: string): Prop | null {
  // Split name;params from value at the first ':' that isn't inside quotes.
  let inQuotes = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ':' && !inQuotes) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;
  const [name, ...paramParts] = line.slice(0, colon).split(';');
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

function unescapeText(v: string) {
  return v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
}

/** Returns a UTC instant, or null for all-day (VALUE=DATE) values. */
function parseDateTime(prop: Prop, defaultZone: string): number | null {
  if (prop.params.VALUE === 'DATE' || /^\d{8}$/.test(prop.value)) return null;
  const m = prop.value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) throw new Error(`Unrecognised date-time "${prop.value}"`);
  const [, y, mo, d, h, mi, s, z] = m;
  if (z) return Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0));
  const zone = resolveZone(prop.params.TZID, defaultZone);
  return zonedToUtc(`${y}-${mo}-${d}`, +h * 60 + +mi, zone) + +(s ?? 0) * 1000;
}

function parseDuration(v: string): number {
  const m = v.match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) throw new Error(`Unrecognised duration "${v}"`);
  const [, sign, w, d, h, mi, s] = m;
  const ms = ((+(w ?? 0) * 7 + +(d ?? 0)) * 86400 + +(h ?? 0) * 3600 + +(mi ?? 0) * 60 + +(s ?? 0)) * 1000;
  return sign === '-' ? -ms : ms;
}

export function parseIcs(text: string, defaultZone: string): { events: IcsEvent[]; skipped: number } {
  const events: IcsEvent[] = [];
  let skipped = 0;
  let current: Prop[] | null = null;

  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') {
      current = [];
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current) {
        const ev = toEvent(current, defaultZone);
        if (ev) events.push(ev);
        else skipped++;
      }
      current = null;
      continue;
    }
    if (current) {
      const prop = parseLine(line);
      if (prop) current.push(prop);
    }
  }
  return { events, skipped };
}

function toEvent(props: Prop[], defaultZone: string): IcsEvent | null {
  const get = (name: string) => props.find((p) => p.name === name);
  const uid = get('UID')?.value;
  const dtstart = get('DTSTART');
  if (!uid || !dtstart) return null;
  try {
    const startUtc = parseDateTime(dtstart, defaultZone);
    if (startUtc === null) return null; // all-day event, not a shift
    const dtend = get('DTEND');
    const duration = get('DURATION');
    const endUtc = dtend
      ? parseDateTime(dtend, defaultZone)
      : duration
        ? startUtc + parseDuration(duration.value)
        : null;
    if (endUtc === null || endUtc <= startUtc) return null;
    const summary = get('SUMMARY');
    return {
      uid,
      startUtc,
      endUtc,
      summary: summary ? unescapeText(summary.value) : null,
      cancelled: get('STATUS')?.value.toUpperCase() === 'CANCELLED',
    };
  } catch {
    return null;
  }
}

/** webcal:// links are plain https underneath. */
export function normaliseFeedUrl(raw: string): string {
  const url = new URL(raw.trim().replace(/^webcals?:\/\//i, 'https://'));
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Calendar link must be a webcal or https URL.');
  return url.toString();
}
