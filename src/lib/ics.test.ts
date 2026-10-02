import { describe, expect, it } from 'vitest';
import { normaliseFeedUrl, parseIcs } from './ics';

const TZ = 'Australia/Melbourne';
const iso = (ms: number) => new Date(ms).toISOString();

const feed = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:shift-1@humanforce',
  'DTSTART:20261005T070000Z',
  'DTEND:20261005T150000Z',
  'SUMMARY:Store 12\\, Night fill',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:shift-2@humanforce',
  'DTSTART;TZID=Australia/Melbourne:20261003T220000',
  'DTEND;TZID=Australia/Melbourne:20261004T060000',
  'SUMMARY:Overnight across',
  '  DST',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:shift-3@humanforce',
  'DTSTART;TZID="AUS Eastern Standard Time":20260610T170000',
  'DURATION:PT8H',
  'STATUS:CANCELLED',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:allday',
  'DTSTART;VALUE=DATE:20261010',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:floating',
  'DTSTART:20260610T090000',
  'DTEND:20260610T170000',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('parseIcs', () => {
  const { events, skipped } = parseIcs(feed, TZ);

  it('parses UTC, TZID, Windows zone names, durations and floating times', () => {
    expect(events.map((e) => [e.uid, iso(e.startUtc), iso(e.endUtc)])).toEqual([
      ['shift-1@humanforce', '2026-10-05T07:00:00.000Z', '2026-10-05T15:00:00.000Z'],
      // 10pm AEST (+10) → 6am AEDT (+11): 7 real hours
      ['shift-2@humanforce', '2026-10-03T12:00:00.000Z', '2026-10-03T19:00:00.000Z'],
      ['shift-3@humanforce', '2026-06-10T07:00:00.000Z', '2026-06-10T15:00:00.000Z'],
      ['floating', '2026-06-09T23:00:00.000Z', '2026-06-10T07:00:00.000Z'],
    ]);
    expect(skipped).toBe(1); // the all-day event
  });

  it('unescapes and unfolds text, flags cancellations', () => {
    expect(events[0].summary).toBe('Store 12, Night fill');
    expect(events[1].summary).toBe('Overnight across DST');
    expect(events[2].cancelled).toBe(true);
  });
});

describe('normaliseFeedUrl', () => {
  it('turns webcal into https', () => {
    expect(normaliseFeedUrl('webcal://example.humanforce.com/ical/abc?token=1')).toBe('https://example.humanforce.com/ical/abc?token=1');
  });
  it('rejects other schemes', () => {
    expect(() => normaliseFeedUrl('ftp://x/y')).toThrow();
  });
});
