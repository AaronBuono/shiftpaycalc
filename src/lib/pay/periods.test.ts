import { describe, expect, it } from 'vitest';
import { periodFor, recentPeriods } from './periods';

const weekly = { type: 'weekly' as const, startDow: 1, anchorDate: '2026-01-05' };
const fortnightly = { type: 'fortnightly' as const, startDow: 1, anchorDate: '2026-01-05' };

describe('pay periods', () => {
  it('weekly Mon–Sun', () => {
    expect(periodFor('2026-10-02', weekly)).toEqual({ start: '2026-09-28', end: '2026-10-05' });
    expect(periodFor('2026-10-04', weekly)).toEqual({ start: '2026-09-28', end: '2026-10-05' });
    expect(periodFor('2026-10-05', weekly)).toEqual({ start: '2026-10-05', end: '2026-10-12' });
  });

  it('fortnightly aligned to the anchor', () => {
    // 2026-01-05 + 38 weeks = 2026-09-28 (even) → fortnight 28 Sep – 11 Oct
    expect(periodFor('2026-10-02', fortnightly)).toEqual({ start: '2026-09-28', end: '2026-10-12' });
    expect(periodFor('2026-10-08', fortnightly)).toEqual({ start: '2026-09-28', end: '2026-10-12' });
    expect(periodFor('2026-10-12', fortnightly)).toEqual({ start: '2026-10-12', end: '2026-10-26' });
    expect(periodFor('2025-12-30', fortnightly)).toEqual({ start: '2025-12-22', end: '2026-01-05' });
  });

  it('recent periods, oldest first', () => {
    const p = recentPeriods('2026-10-02', weekly, 3);
    expect(p.map((x) => x.start)).toEqual(['2026-09-14', '2026-09-21', '2026-09-28']);
  });
});
