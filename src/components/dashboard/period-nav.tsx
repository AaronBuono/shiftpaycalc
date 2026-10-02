import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { formatPeriod } from '@/lib/format';
import type { Period } from '@/lib/pay/periods';
import { addDays } from '@/lib/pay/dates';

/** Prev / current / next links for a pay period, via ?date=. */
export function PeriodNav({ basePath, period, today, length }: { basePath: string; period: Period; today: string; length: number }) {
  const isCurrent = today >= period.start && today < period.end;
  const href = (date: string) => `${basePath}?date=${date}`;
  return (
    <div className="flex items-center gap-1">
      <Button asChild variant="secondary" size="icon-lg" className="size-10">
        <Link href={href(addDays(period.start, -length))} aria-label="Previous period">
          <ChevronLeft className="size-5" />
        </Link>
      </Button>
      <div className="min-w-36 px-2 text-center">
        <p className="text-sm font-medium tabular-nums">{formatPeriod(period.start, period.end)}</p>
        {isCurrent ? (
          <p className="text-primary text-xs">This {length === 14 ? 'fortnight' : 'week'}</p>
        ) : (
          <Link href={basePath} className="text-muted-foreground hover:text-primary text-xs underline-offset-2 hover:underline">
            Back to this {length === 14 ? 'fortnight' : 'week'}
          </Link>
        )}
      </div>
      <Button asChild variant="secondary" size="icon-lg" className="size-10">
        <Link href={href(addDays(period.start, length))} aria-label="Next period">
          <ChevronRight className="size-5" />
        </Link>
      </Button>
    </div>
  );
}
