import { Plus } from 'lucide-react';
import type { Metadata } from 'next';

import { PeriodNav } from '@/components/dashboard/period-nav';
import { ShiftCard } from '@/components/shifts/shift-card';
import { ShiftEditor } from '@/components/shifts/shift-editor';
import { Button } from '@/components/ui/button';
import { requireUser } from '@/lib/auth';
import { getPeriodShifts, todayIn } from '@/lib/data';
import { formatHours, formatMoney } from '@/lib/format';

export const metadata: Metadata = { title: 'Shifts' };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function ShiftsPage({ searchParams }: PageProps<'/shifts'>) {
  const user = await requireUser();
  const { date } = await searchParams;
  const anchor = typeof date === 'string' && DATE_RE.test(date) ? date : undefined;
  const { period, cfg, settings, views, summary } = await getPeriodShifts(user.id, anchor);
  const today = todayIn(settings.timeZone);
  const length = cfg.type === 'fortnightly' ? 14 : 7;
  const defaultDate = today >= period.start && today < period.end ? today : period.start;
  const removed = views.filter((v) => v.removedFromFeed).length;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-muted-foreground text-sm">Total pay</p>
          <p className="font-mono text-4xl font-semibold tabular-nums">{formatMoney(summary.pay)}</p>
          <p className="text-muted-foreground mt-1 text-sm">
            {summary.shiftCount} shift{summary.shiftCount === 1 ? '' : 's'} · {formatHours(summary.paidMinutes)} paid
            {removed > 0 && ` · ${removed} removed from roster`}
          </p>
        </div>
        <PeriodNav basePath="/shifts" period={period} today={today} length={length} />
      </div>

      <div className="mt-8 mb-3 flex items-center justify-between">
        <h2 className="text-lg font-medium">Shifts</h2>
        <ShiftEditor
          defaultDate={defaultDate}
          defaultBreakMinutes={settings.rules.breakMinutes}
          trigger={
            <Button className="h-10 gap-1.5 px-4">
              <Plus className="size-4" /> Add shift
            </Button>
          }
        />
      </div>

      {views.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed px-4 py-12 text-center text-sm">
          No shifts this {length === 14 ? 'fortnight' : 'week'}.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {views.map((v) => (
            <ShiftCard key={v.id} shift={v} timeZone={settings.timeZone} defaultBreakMinutes={settings.rules.breakMinutes} />
          ))}
        </div>
      )}
    </div>
  );
}
