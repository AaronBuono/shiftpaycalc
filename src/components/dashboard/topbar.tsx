'use client';

import { RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { syncNow } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatRelative, syncSummaryText } from '@/lib/format';
import { NAVIGATION } from './sidebar';
import { Logo } from './logo';

export type CalendarStatus = {
  stale: boolean;
  lastSyncedAt: number | null;
  lastStatus: 'ok' | 'error' | null;
  lastError: string | null;
};

export function DashboardTopbar({ calendar }: { calendar: CalendarStatus | null }) {
  const pathname = usePathname();
  const current = NAVIGATION.find((n) => (n.href === '/' ? pathname === '/' : pathname.startsWith(n.href))) ?? NAVIGATION[0];
  const [pending, startTransition] = useTransition();

  function onSync() {
    startTransition(async () => {
      const res = await syncNow();
      if (res.ok) toast.success('Roster synced', { description: res.data ? syncSummaryText(res.data) : undefined });
      else toast.error('Sync failed', { description: res.error });
    });
  }

  return (
    <header className="bg-background/95 sticky top-0 z-30 flex h-16 items-center gap-2 border-b px-4 backdrop-blur md:h-21 md:pr-8 md:pl-6">
      <div className="mr-auto flex min-w-0 items-center gap-2 text-lg font-medium md:gap-3">
        <Logo className="size-7 md:hidden" />
        <current.icon className="hidden size-5 md:block" />
        <span className="truncate">{current.label}</span>
      </div>

      {calendar ? (
        <>
          <SyncStatus calendar={calendar} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Sync roster now"
                variant="secondary"
                size="icon-lg"
                className="size-11 md:w-auto md:gap-2 md:px-4"
                disabled={pending}
                onClick={onSync}
              >
                <RefreshCw className={cn('size-5', pending && 'animate-spin')} />
                <span className="hidden md:inline">{pending ? 'Syncing…' : 'Sync now'}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Pull the latest roster from Humanforce</TooltipContent>
          </Tooltip>
        </>
      ) : (
        <Button asChild variant="secondary" className="h-11 px-4">
          <Link href="/settings#calendar">Connect roster</Link>
        </Button>
      )}
    </header>
  );
}

function SyncStatus({ calendar }: { calendar: CalendarStatus }) {
  const { stale } = calendar;
  const error = calendar.lastStatus === 'error';
  return (
    <div className="hidden text-right text-xs leading-tight sm:block">
      <p suppressHydrationWarning className={cn('font-medium', error ? 'text-destructive' : stale ? 'text-evening' : 'text-muted-foreground')}>
        {error ? 'Last sync failed' : calendar.lastSyncedAt ? `Synced ${formatRelative(calendar.lastSyncedAt)}` : 'Not synced yet'}
      </p>
      {error && calendar.lastError && <p className="text-muted-foreground max-w-56 truncate">{calendar.lastError}</p>}
    </div>
  );
}
