// Pay rules: everything calcShift needs that a user can configure.

export type LoadingKind = 'evening' | 'night';

export type Loading = {
  kind: LoadingKind;
  /** Minutes since local midnight, inclusive. Multiple of 15. */
  startMin: number;
  /** Minutes since local midnight, exclusive (1440 = midnight). Multiple of 15. */
  endMin: number;
  /** $/hr added on top of the day rate. */
  amount: number;
  /** Days the loading applies, 0=Sun..6=Sat. */
  days: number[];
};

export type PayRules = {
  baseRate: number; // reference only, not used in calculations
  /** Hourly rate per day of week, 0=Sun..6=Sat. */
  dayRates: number[];
  /** Flat public holiday rate; loadings never stack on top of it. */
  publicHolidayRate: number;
  loadings: Loading[];
  /** Unpaid break length, deducted from the end of the shift. Multiple of 15. */
  breakMinutes: number;
  /** Break applies to shifts strictly longer than this. */
  breakThresholdMinutes: number;
};

export const WEEKDAYS = [1, 2, 3, 4, 5];

/** AJ's current rates (carried over from shift-pay-calculator.html). */
export const DEFAULT_RULES: PayRules = {
  baseRate: 27.08,
  dayRates: [47.39, 33.85, 33.85, 33.85, 33.85, 33.85, 40.62],
  publicHolidayRate: 67.7,
  loadings: [
    { kind: 'evening', startMin: 19 * 60, endMin: 24 * 60, amount: 2.95, days: WEEKDAYS },
    { kind: 'night', startMin: 0, endMin: 7 * 60, amount: 4.22, days: WEEKDAYS },
  ],
  breakMinutes: 30,
  breakThresholdMinutes: 6 * 60,
};

/** Returns a list of problems, empty when the rules are valid. */
export function validateRules(r: PayRules): string[] {
  const errors: string[] = [];
  const money = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 10_000;
  if (!Array.isArray(r.dayRates) || r.dayRates.length !== 7 || !r.dayRates.every(money)) {
    errors.push('Day rates must be seven non-negative amounts.');
  }
  if (!money(r.publicHolidayRate)) errors.push('Public holiday rate is invalid.');
  if (!money(r.baseRate)) errors.push('Base rate is invalid.');
  for (const l of r.loadings) {
    if (!money(l.amount)) errors.push(`${l.kind} loading amount is invalid.`);
    if (l.startMin % 15 || l.endMin % 15) errors.push(`${l.kind} loading times must be on a 15-minute boundary.`);
    if (!(l.startMin >= 0 && l.endMin <= 1440 && l.startMin < l.endMin)) {
      errors.push(`${l.kind} loading must start before it ends, within one day.`);
    }
  }
  if (r.breakMinutes % 15 || r.breakMinutes < 0 || r.breakMinutes > 120) {
    errors.push('Break must be 0–120 minutes in 15-minute steps.');
  }
  if (!(r.breakThresholdMinutes >= 0 && r.breakThresholdMinutes <= 24 * 60)) {
    errors.push('Break threshold is invalid.');
  }
  return errors;
}
