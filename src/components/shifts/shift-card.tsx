'use client';

import { AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { deleteShift, resolveConflict } from '@/app/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ShiftView } from '@/lib/data';
import { dayName, formatDate, formatHours, formatMoney, formatTimeInZone, minutesLabel, TAG_LABEL } from '@/lib/format';
import type { SegmentTag } from '@/lib/pay/engine';
import { cn } from '@/lib/utils';
import { ShiftEditor } from './shift-editor';

const TAG_CLASS: Record<SegmentTag, string> = {
  day: 'bg-day/20 text-foreground/70',
  evening: 'bg-evening/15 text-evening',
  night: 'bg-night/15 text-night',
  holiday: 'bg-holiday/15 text-holiday',
};

export function SegmentTagPill({ tag }: { tag: SegmentTag }) {
  return (
    <span className={cn('inline-flex w-16 justify-center rounded px-1.5 py-0.5 text-[11px] font-semibold', TAG_CLASS[tag])}>
      {TAG_LABEL[tag]}
    </span>
  );
}

export function ShiftCard({ shift, timeZone, defaultBreakMinutes }: { shift: ShiftView; timeZone: string; defaultBreakMinutes: number }) {
  const [pending, startTransition] = useTransition();
  const { pay } = shift;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) toast.success(success);
      else toast.error(res.error ?? 'Something went wrong.');
    });
  }

  const timesLine = [
    `${minutesLabel(shift.localStartMin)}–${minutesLabel(shift.localEndMin)}`,
    `${formatHours(pay.totalMinutes)} shift`,
    pay.breakMinutes > 0 ? `${formatHours(pay.paidMinutes)} paid` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className={cn('bg-card overflow-hidden rounded-xl border', shift.removedFromFeed && 'opacity-70')}>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 pt-3.5 pb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-[15px] font-semibold">{formatDate(shift.localDate)}</h3>
            {shift.holidayName && <Badge className="bg-holiday text-background border-0">{shift.holidayName}</Badge>}
            <Badge variant="outline" className="text-muted-foreground font-normal">
              {shift.source === 'manual' ? 'Manual' : shift.editedByUser ? 'Roster · edited' : 'Roster'}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs">{timesLine}</p>
          {shift.title && <p className="text-muted-foreground/80 mt-0.5 truncate text-xs">{shift.title}</p>}
        </div>
        <p className={cn('font-mono text-lg font-semibold tabular-nums', shift.removedFromFeed && 'line-through')}>{formatMoney(pay.subtotal)}</p>
      </header>

      {shift.conflict && (
        <div className="bg-evening/10 border-evening/30 mx-4 mb-3 rounded-lg border p-3 text-sm">
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="text-evening size-4" />
            Roster now says {formatTimeInZone(shift.conflict.startUtc, timeZone)}–{formatTimeInZone(shift.conflict.endUtc, timeZone)}
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">You edited this shift, so your times are being used.</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" disabled={pending} onClick={() => run(() => resolveConflict(shift.id, 'roster'), 'Using roster times')}>
              Use roster times
            </Button>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => resolveConflict(shift.id, 'mine'), 'Keeping your times')}>
              Keep mine
            </Button>
          </div>
        </div>
      )}

      {shift.removedFromFeed && (
        <p className="bg-destructive/10 text-destructive mx-4 mb-3 rounded-lg px-3 py-2 text-xs">
          No longer on your roster — not counted in totals.
        </p>
      )}

      <ul className="border-t">
        {pay.segments.map((seg, i) => (
          <li key={i} className="flex items-center justify-between gap-3 border-b px-4 py-2 text-xs last:border-b-0">
            <span className="text-muted-foreground flex items-center gap-2">
              <SegmentTagPill tag={seg.tag} />
              {dayName(seg.dow)} {minutesLabel(seg.fromMin)}–{minutesLabel(seg.toMin)}
            </span>
            <span className="font-mono tabular-nums">
              {formatHours(seg.minutes)} × {formatMoney(seg.rate)}
            </span>
          </li>
        ))}
        {pay.breakMinutes > 0 && (
          <li className="flex items-center justify-between gap-3 border-t px-4 py-2 text-xs">
            <span className="text-muted-foreground flex items-center gap-2">
              <span className="bg-destructive/15 text-destructive inline-flex w-16 justify-center rounded px-1.5 py-0.5 text-[11px] font-semibold">
                Break
              </span>
              Unpaid{shift.breakOverrideMinutes === null ? ' (auto)' : ''}
            </span>
            <span className="text-destructive font-mono tabular-nums">
              −{formatHours(pay.breakMinutes)} · −{formatMoney(pay.breakDeduction)}
            </span>
          </li>
        )}
      </ul>

      <footer className="flex border-t">
        <ShiftEditor
          shift={shift}
          defaultDate={shift.localDate}
          defaultBreakMinutes={defaultBreakMinutes}
          trigger={
            <Button variant="ghost" className="h-10 flex-1 rounded-none text-xs" disabled={pending}>
              <Pencil className="size-3.5" /> Edit
            </Button>
          }
        />
        <Button
          variant="ghost"
          className="text-destructive hover:text-destructive h-10 flex-1 rounded-none border-l text-xs"
          disabled={pending}
          onClick={() => {
            if (confirm(`Delete the ${formatDate(shift.localDate)} shift?`)) run(() => deleteShift(shift.id), 'Shift deleted');
          }}
        >
          <Trash2 className="size-3.5" /> Delete
        </Button>
      </footer>
    </article>
  );
}
