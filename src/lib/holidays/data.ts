// Public holiday reference data, seeded into the public_holidays table by
// `npm run db:seed`. Refresh yearly from the state's official list
// (VIC: business.vic.gov.au/business-information/public-holidays).

export type HolidaySeed = {
  state: string;
  date: string;
  name: string;
  /** Holidays only observed in part of the state; users can switch them off. */
  regional?: 'melbourne-cup';
};

export const PUBLIC_HOLIDAYS: HolidaySeed[] = [
  // Victoria 2026
  { state: 'VIC', date: '2026-01-01', name: "New Year's Day" },
  { state: 'VIC', date: '2026-01-26', name: 'Australia Day' },
  { state: 'VIC', date: '2026-03-09', name: 'Labour Day' },
  { state: 'VIC', date: '2026-04-03', name: 'Good Friday' },
  { state: 'VIC', date: '2026-04-04', name: 'Saturday before Easter Sunday' },
  { state: 'VIC', date: '2026-04-05', name: 'Easter Sunday' },
  { state: 'VIC', date: '2026-04-06', name: 'Easter Monday' },
  { state: 'VIC', date: '2026-04-25', name: 'ANZAC Day' },
  { state: 'VIC', date: '2026-06-08', name: "King's Birthday" },
  { state: 'VIC', date: '2026-09-25', name: 'Friday before AFL Grand Final' },
  { state: 'VIC', date: '2026-11-03', name: 'Melbourne Cup', regional: 'melbourne-cup' },
  { state: 'VIC', date: '2026-12-25', name: 'Christmas Day' },
  { state: 'VIC', date: '2026-12-26', name: 'Boxing Day' },
  { state: 'VIC', date: '2026-12-28', name: 'Boxing Day (additional day)' },

  // Victoria 2027
  { state: 'VIC', date: '2027-01-01', name: "New Year's Day" },
  { state: 'VIC', date: '2027-01-26', name: 'Australia Day' },
  { state: 'VIC', date: '2027-03-08', name: 'Labour Day' },
  { state: 'VIC', date: '2027-03-26', name: 'Good Friday' },
  { state: 'VIC', date: '2027-03-27', name: 'Saturday before Easter Sunday' },
  { state: 'VIC', date: '2027-03-28', name: 'Easter Sunday' },
  { state: 'VIC', date: '2027-03-29', name: 'Easter Monday' },
  { state: 'VIC', date: '2027-04-25', name: 'ANZAC Day' },
  { state: 'VIC', date: '2027-06-14', name: "King's Birthday" },
  // Set by the state government once the AFL fixture is final — confirm each year.
  { state: 'VIC', date: '2027-09-24', name: 'Friday before AFL Grand Final (TBC)' },
  { state: 'VIC', date: '2027-11-02', name: 'Melbourne Cup', regional: 'melbourne-cup' },
  { state: 'VIC', date: '2027-12-25', name: 'Christmas Day' },
  { state: 'VIC', date: '2027-12-26', name: 'Boxing Day' },
  { state: 'VIC', date: '2027-12-27', name: 'Christmas Day (additional day)' },
  { state: 'VIC', date: '2027-12-28', name: 'Boxing Day (additional day)' },
];

export const SUPPORTED_STATES = ['VIC'] as const;
