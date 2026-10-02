'use client';

import { useState } from 'react';

import { Card, CardContent } from '@/components/ui/card';
import { formatMoney, formatMoneyShort } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DonutChart } from './donut-chart';

export type BreakdownSegment = { key: string; label: string; amount: number; color: string };

export function PayBreakdown({ segments, title }: { segments: BreakdownSegment[]; title: string }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const shown = segments.filter((s) => s.amount > 0.004);
  const total = shown.reduce((n, s) => n + s.amount, 0);

  return (
    <div className="flex h-full flex-col">
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="text-muted-foreground text-sm">Where this period’s pay comes from</p>
      <Card className="mt-5 flex flex-1 flex-col rounded-lg border py-0 shadow-none ring-0">
        {total === 0 ? (
          <CardContent className="text-muted-foreground flex flex-1 items-center justify-center p-8 text-center text-sm">
            No pay yet this period.
          </CardContent>
        ) : (
          <CardContent className="flex h-full flex-col items-center justify-between gap-5 p-4 sm:flex-row sm:gap-8 sm:px-8 @4xl/dashboard:flex-col @4xl/dashboard:gap-5 @4xl/dashboard:px-4">
            <DonutChart
              data={shown.map((s) => ({ name: s.label, value: s.amount, fill: s.color }))}
              total={total}
              label="Total"
              format={formatMoneyShort}
              size={180}
              activeIndex={activeIndex}
              onActiveIndexChange={setActiveIndex}
            />
            <div className="flex w-full flex-col gap-2 sm:max-w-64 @4xl/dashboard:max-w-none">
              {shown.map((s, index) => (
                <div
                  key={s.key}
                  className={cn(
                    'grid grid-cols-[1fr_auto_3rem] items-center gap-3 text-sm transition-opacity duration-200',
                    activeIndex !== null && activeIndex !== index && 'opacity-40',
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                >
                  <div className="text-secondary-foreground/80 flex min-w-0 items-center gap-2">
                    <span className="size-3 shrink-0 rounded" style={{ backgroundColor: s.color }} />
                    <span className="truncate">{s.label}</span>
                  </div>
                  <span className="font-medium tabular-nums">{formatMoney(s.amount)}</span>
                  <span className="text-muted-foreground text-right tabular-nums">{Math.round((s.amount / total) * 100)}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
