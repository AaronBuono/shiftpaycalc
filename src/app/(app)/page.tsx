import { AlertTriangle, ArrowRight, CalendarClock, CalendarDays, Clock, Link2, RefreshCw, Wallet } from 'lucide-react';
import Link from 'next/link';

import { HistoryChart, type HistoryPoint } from '@/components/dashboard/history-chart';
import { PayBreakdown, type BreakdownSegment } from '@/components/dashboard/pay-breakdown';
import { PeriodNav } from '@/components/dashboard/period-nav';
import { SegmentTagPill } from '@/components/shifts/shift-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { requireUser } from '@/lib/auth';
import { getDashboard, type ShiftView } from '@/lib/data';
import { formatDate, formatHours, formatMoney, formatPeriod, formatRelative, minutesLabel } from '@/lib/format';
import { cn } from '@/lib/utils';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function DashboardPage({ searchParams }: PageProps<'/'>) {
  const user = await requireUser();
  const { date } = await searchParams;
  const anchor = typeof date === 'string' && DATE_RE.test(date) ? date : undefined;
  const d = await getDashboard(user.id, anchor);
  const noun = d.cfg.type === 'fortnightly' ? 'fortnight' : 'week';
  const length = d.cfg.type === 'fortnightly' ? 14 : 7;
  const isCurrent = d.today >= d.current.period.start && d.today < d.current.period.end;
  const conflicts = d.currentViews.filter((v) => v.conflict).length;
  const firstName = user.name.split(' ')[0];
  const hour = d.localHour;
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const payDelta = d.previous && d.previous.pay > 0 ? ((d.current.pay - d.previous.pay) / d.previous.pay) * 100 : null;

  const history: HistoryPoint[] = d.history.map((h) => ({
    label: formatDate(h.period.start, { weekday: false }),
    range: formatPeriod(h.period.start, h.period.end),
    pay: h.pay,
    hours: Math.round((h.paidMinutes / 60) * 100) / 100,
    shifts: h.shiftCount,
    current: h === d.current,
  }));

  const breakdown: BreakdownSegment[] = [
    { key: 'day', label: 'Weekday', amount: d.breakdown.day, color: 'var(--day)' },
    { key: 'weekend', label: 'Weekend', amount: d.breakdown.weekend, color: 'var(--weekend)' },
    { key: 'evening', label: 'Evening', amount: d.breakdown.evening, color: 'var(--evening)' },
    { key: 'night', label: 'Night', amount: d.breakdown.night, color: 'var(--night)' },
    { key: 'holiday', label: 'Public holiday', amount: d.breakdown.holiday, color: 'var(--holiday)' },
  ];

  return (
    <>
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:mb-10 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-xl leading-[1.4] font-medium">
            {greeting}, {firstName}
          </h1>
          <p className="text-muted-foreground text-base">{formatDate(d.today, { year: true })}</p>
        </div>
        <PeriodNav basePath="/" period={d.current.period} today={d.today} length={length} />
      </div>

      {!d.calendar.connected && (
        <Banner icon={Link2} tone="primary" href="/settings#calendar" action="Connect">
          Connect your Humanforce roster so shifts appear here automatically.
        </Banner>
      )}
      {d.calendar.connected && d.calendar.lastStatus === 'error' && (
        <Banner icon={RefreshCw} tone="destructive" href="/settings#calendar" action="Check">
          The last roster sync failed{d.calendar.lastError ? `: ${d.calendar.lastError}` : '.'}
        </Banner>
      )}
      {conflicts > 0 && (
        <Banner icon={AlertTriangle} tone="evening" href={`/shifts?date=${d.current.period.start}`} action="Review">
          {conflicts} shift{conflicts === 1 ? '' : 's'} changed on the roster after you edited {conflicts === 1 ? 'it' : 'them'}.
        </Banner>
      )}

      <div className="@container/dashboard space-y-10">
        <section>
          <SectionTitle>{isCurrent ? `This ${noun}` : formatPeriod(d.current.period.start, d.current.period.end)}</SectionTitle>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              icon={Wallet}
              iconClassName="text-primary"
              label="Pay"
              value={formatMoney(d.current.pay)}
              note={
                payDelta === null
                  ? `No pay last ${noun}`
                  : `${payDelta >= 0 ? '+' : ''}${payDelta.toFixed(0)}% vs last ${noun}`
              }
              highlight
            />
            <MetricCard
              icon={Clock}
              iconClassName="text-night"
              label="Paid hours"
              value={formatHours(d.current.paidMinutes)}
              note={d.previous ? `${formatHours(d.previous.paidMinutes)} last ${noun}` : ''}
            />
            <MetricCard
              icon={CalendarDays}
              iconClassName="text-evening"
              label="Shifts"
              value={String(d.current.shiftCount)}
              note={
                d.current.shiftCount
                  ? `avg ${formatMoney(d.current.pay / d.current.shiftCount)} per shift`
                  : 'Nothing rostered'
              }
            />
            <MetricCard
              icon={CalendarClock}
              iconClassName="text-holiday"
              label="Next shift"
              value={d.nextShift ? formatDate(d.nextShift.localDate) : '—'}
              note={
                d.nextShift
                  ? `${minutesLabel(d.nextShift.localStartMin)}–${minutesLabel(d.nextShift.localEndMin)} · ${formatMoney(d.nextShift.pay.subtotal)}`
                  : 'None on the roster'
              }
            />
          </div>
        </section>

        <section className="grid grid-cols-1 items-stretch gap-8 @4xl/dashboard:grid-cols-3">
          <div className="@4xl/dashboard:col-span-2">
            <HistoryChart data={history} periodNoun={noun} />
          </div>
          <div className="min-h-84">
            <PayBreakdown segments={breakdown} title="Pay breakdown" />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-8 @4xl/dashboard:grid-cols-2">
          <PeriodShifts views={d.currentViews} start={d.current.period.start} noun={noun} />
          <RecentActivity items={d.recent} />
        </section>
      </div>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-medium">{children}</h2>;
}

function Banner({
  icon: Icon,
  tone,
  href,
  action,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: 'primary' | 'destructive' | 'evening';
  href: string;
  action: string;
  children: React.ReactNode;
}) {
  const toneClass = {
    primary: 'border-primary/30 bg-primary/10 [&_svg]:text-primary',
    destructive: 'border-destructive/30 bg-destructive/10 [&_svg]:text-destructive',
    evening: 'border-evening/30 bg-evening/10 [&_svg]:text-evening',
  }[tone];
  return (
    <div className={cn('mb-6 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm', toneClass)}>
      <Icon className="size-5 shrink-0" />
      <p className="flex-1">{children}</p>
      <Button asChild size="sm" variant="secondary">
        <Link href={href}>{action}</Link>
      </Button>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  iconClassName,
  label,
  value,
  note,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconClassName: string;
  label: string;
  value: string;
  note: string;
  highlight?: boolean;
}) {
  return (
    <Card
      className={cn(
        'bg-secondary text-secondary-foreground gap-4 rounded-lg p-3.5 shadow-none ring-0 sm:gap-6 sm:p-4',
        highlight && 'ring-primary/25 ring-1',
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn('size-5 shrink-0', iconClassName)} />
        <span className="text-secondary-foreground/80 text-sm leading-[1.4] font-medium">{label}</span>
      </div>
      <div className="flex flex-col gap-3">
        <h3 className={cn('text-2xl leading-none font-medium tabular-nums sm:text-[30px]', highlight ? 'text-primary' : 'text-foreground')}>{value}</h3>
        <p className="text-muted-foreground text-xs">{note}</p>
      </div>
    </Card>
  );
}

function PeriodShifts({ views, start, noun }: { views: ShiftView[]; start: string; noun: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>Shifts this {noun}</SectionTitle>
        <Link href={`/shifts?date=${start}`} className="text-accent-foreground hover:text-primary flex items-center gap-1 text-sm">
          Details <ArrowRight className="size-4" />
        </Link>
      </div>
      <div className="mt-5 flex flex-col gap-2">
        {views.length === 0 && (
          <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-sm">No shifts this {noun}.</p>
        )}
        {views.map((v) => (
          <Link
            key={v.id}
            href={`/shifts?date=${start}`}
            className={cn(
              'bg-secondary hover:bg-accent flex items-center justify-between gap-3 rounded-lg px-3.5 py-3 transition-colors',
              v.removedFromFeed && 'opacity-50',
            )}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {formatDate(v.localDate)}
                {v.holidayName && <span className="text-holiday ml-2 text-xs">{v.holidayName}</span>}
              </p>
              <p className="text-muted-foreground text-xs">
                {minutesLabel(v.localStartMin)}–{minutesLabel(v.localEndMin)} · {formatHours(v.pay.paidMinutes)} paid
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden gap-1 sm:flex">
                {[...new Set(v.pay.segments.map((s) => s.tag))].map((tag) => (
                  <SegmentTagPill key={tag} tag={tag} />
                ))}
              </div>
              <span className={cn('font-mono text-sm font-semibold tabular-nums', v.removedFromFeed && 'line-through')}>
                {formatMoney(v.pay.subtotal)}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function RecentActivity({ items }: { items: ShiftView[] }) {
  return (
    <div>
      <SectionTitle>Recent activity</SectionTitle>
      <div className="mt-5 flex flex-col gap-5">
        {items.length === 0 && <p className="text-muted-foreground text-sm">Nothing yet — add a shift or connect your roster.</p>}
        {items.map((v) => {
          const { icon: Icon, text } = describe(v);
          return (
            <div key={v.id} className="flex items-center gap-3">
              <div className="bg-secondary text-secondary-foreground flex size-11 shrink-0 items-center justify-center rounded-lg">
                <Icon className="size-5" />
              </div>
              <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                <p className="text-sm leading-[1.4]">
                  <span className="text-muted-foreground">{text} </span>
                  <span className="font-medium">
                    {formatDate(v.localDate)} {minutesLabel(v.localStartMin)}–{minutesLabel(v.localEndMin)}
                  </span>
                </p>
                <time className="text-muted-foreground shrink-0 text-xs">{formatRelative(v.updatedAt)}</time>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function describe(v: ShiftView): { icon: React.ComponentType<{ className?: string }>; text: string } {
  if (v.conflict) return { icon: AlertTriangle, text: 'Roster changed' };
  if (v.removedFromFeed) return { icon: CalendarDays, text: 'Removed from roster' };
  if (v.source === 'manual') return { icon: CalendarDays, text: 'Added manually' };
  if (v.editedByUser) return { icon: CalendarDays, text: 'Edited' };
  return { icon: RefreshCw, text: 'Synced from roster' };
}
