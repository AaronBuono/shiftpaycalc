import { addDays, dayOfWeek, daysBetween } from './dates';

export type PeriodType = 'weekly' | 'fortnightly';

export type PeriodConfig = {
  type: PeriodType;
  /** Day the period starts, 0=Sun..6=Sat. Default Monday. */
  startDow: number;
  /** For fortnightly: any date that is the first day of a pay fortnight. */
  anchorDate: string;
};

export type Period = {
  start: string; // inclusive local date
  end: string; // exclusive local date
};

export function periodFor(date: string, cfg: PeriodConfig): Period {
  const back = (dayOfWeek(date) - cfg.startDow + 7) % 7;
  let start = addDays(date, -back);
  if (cfg.type === 'fortnightly') {
    const weeks = Math.floor(daysBetween(cfg.anchorDate, start) / 7);
    if (((weeks % 2) + 2) % 2 === 1) start = addDays(start, -7);
  }
  return { start, end: addDays(start, cfg.type === 'fortnightly' ? 14 : 7) };
}

export function shiftPeriod(p: Period, cfg: PeriodConfig, n: number): Period {
  const len = cfg.type === 'fortnightly' ? 14 : 7;
  return { start: addDays(p.start, n * len), end: addDays(p.end, n * len) };
}

/** The last `count` periods ending with the one containing `date`, oldest first. */
export function recentPeriods(date: string, cfg: PeriodConfig, count: number): Period[] {
  const current = periodFor(date, cfg);
  return Array.from({ length: count }, (_, i) => shiftPeriod(current, cfg, i - count + 1));
}
