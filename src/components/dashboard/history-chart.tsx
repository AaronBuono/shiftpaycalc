'use client';

import { Calendar } from 'lucide-react';
import { useId, useState } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { buttonVariants } from '@/components/ui/button';
import { type ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/chart';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatHours, formatMoney, formatMoneyShort } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ArrowDown01Icon } from './icons';

export type HistoryPoint = {
  label: string; // '28 Sep'
  range: string; // '28 Sep – 4 Oct'
  pay: number;
  hours: number; // paid hours
  shifts: number;
  current: boolean;
};

type Metric = 'pay' | 'hours';

const chartConfig = {
  pay: { label: 'Pay', color: 'var(--primary)' },
  hours: { label: 'Hours', color: 'var(--primary)' },
} satisfies ChartConfig;

export function HistoryChart({ data, periodNoun }: { data: HistoryPoint[]; periodNoun: string }) {
  const [metric, setMetric] = useState<Metric>('pay');
  const gradientId = useId().replace(/:/g, '');
  const worked = data.filter((d) => d.shifts > 0);
  const avg = worked.length ? worked.reduce((n, d) => n + d[metric], 0) / worked.length : 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex w-full items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Pay history</h2>
          <p className="text-muted-foreground text-sm">
            Last {data.length} {periodNoun}s · avg {metric === 'pay' ? formatMoneyShort(avg) : formatHours(avg * 60)} per worked {periodNoun}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'text-accent-foreground')}>
            {metric === 'pay' ? 'Pay' : 'Hours'}
            <ArrowDown01Icon className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32 p-1.5 shadow-lg">
            <DropdownMenuGroup>
              {(['pay', 'hours'] as const).map((option) => (
                <DropdownMenuItem
                  key={option}
                  onClick={() => setMetric(option)}
                  className={cn('rounded-lg capitalize', metric === option && 'text-primary font-medium')}
                >
                  {option}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ChartContainer
        config={chartConfig}
        className="mt-5 aspect-auto h-72 w-full grow [&_.recharts-surface]:overflow-visible"
      >
        <AreaChart data={data} accessibilityLayer margin={{ left: 4, right: 12, top: 12, bottom: 4 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.28} />
              <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 6" />
          <YAxis
            width={metric === 'pay' ? 52 : 32}
            tickLine={false}
            axisLine={false}
            fontSize={12}
            stroke="var(--muted-foreground)"
            tickFormatter={(v: number) => (metric === 'pay' ? formatMoneyShort(v) : `${v}h`)}
          />
          <XAxis
            dataKey="label"
            stroke="var(--muted-foreground)"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <ChartTooltip
            cursor={{ stroke: 'var(--primary)', strokeWidth: 1.5 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as HistoryPoint;
              return (
                <div className="bg-foreground text-background z-50 flex min-w-40 flex-col rounded-md shadow-lg">
                  <div className="flex items-center gap-1 px-2.5 py-1.5">
                    <Calendar className="size-3 opacity-80" />
                    <span className="text-[11px] opacity-90">{point.range}</span>
                  </div>
                  <div className="flex flex-col gap-1.5 px-2.5 pb-2 text-xs">
                    <Row label="Pay" value={formatMoney(point.pay)} swatch />
                    <Row label="Paid hours" value={formatHours(point.hours * 60)} />
                    <Row label="Shifts" value={String(point.shifts)} />
                  </div>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey={metric}
            stroke="var(--primary)"
            strokeWidth={2}
            fillOpacity={1}
            fill={`url(#${gradientId})`}
            dot={(props) => {
              const { cx, cy, payload, index } = props as { cx: number; cy: number; payload: HistoryPoint; index: number };
              if (!payload.current) return <g key={index} />;
              return <circle key={index} cx={cx} cy={cy} r={4} fill="var(--primary)" stroke="var(--card)" strokeWidth={2} />;
            }}
            activeDot={{ r: 4, stroke: 'var(--primary)', strokeWidth: 2, fill: 'var(--card)' }}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

function Row({ label, value, swatch }: { label: string; value: string; swatch?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-1.5 opacity-80">
        {swatch && <span className="bg-primary size-1.5 rounded-[1px]" />}
        {label}
      </div>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
