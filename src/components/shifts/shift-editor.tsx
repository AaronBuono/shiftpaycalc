'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';

import { saveShift, type ShiftForm } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export const selectClassName =
  'border-input bg-input h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

const toHHMM = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export type EditableShift = {
  id: string;
  localDate: string;
  localStartMin: number;
  localEndMin: number;
  holidayOverride: ShiftForm['holidayOverride'];
  breakOverrideMinutes: number | null;
  source: 'synced' | 'manual';
};

export function ShiftEditor({
  shift,
  defaultDate,
  trigger,
  defaultBreakMinutes,
}: {
  shift?: EditableShift;
  defaultDate: string;
  trigger: ReactNode;
  defaultBreakMinutes: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<ShiftForm>(() => initial(shift, defaultDate));

  const overnight = form.start && form.end && form.end <= form.start;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await saveShift({ ...form, id: shift?.id });
      if (res.ok) {
        toast.success(shift ? 'Shift updated' : 'Shift added');
        setOpen(false);
        if (!shift) setForm(initial(undefined, form.date));
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setForm(initial(shift, defaultDate));
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{shift ? 'Edit shift' : 'Add a shift'}</DialogTitle>
            <DialogDescription>
              {shift?.source === 'synced'
                ? 'This shift came from your roster. Your changes are kept even if the roster changes — you’ll be asked which times to use.'
                : 'If it runs past midnight, just set the end time — pay is split across both days automatically.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <Label htmlFor="shift-date">Start date</Label>
            <Input id="shift-date" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="shift-start">Start</Label>
              <Input id="shift-start" type="time" step={900} required value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="shift-end">End</Label>
              <Input id="shift-end" type="time" step={900} required value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
            </div>
          </div>
          <p className={cn('text-muted-foreground -mt-2 text-xs', !overnight && 'invisible')}>Ends the next day.</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="shift-holiday">Public holiday</Label>
              <select
                id="shift-holiday"
                className={selectClassName}
                value={form.holidayOverride}
                onChange={(e) => setForm({ ...form, holidayOverride: e.target.value as ShiftForm['holidayOverride'] })}
              >
                <option value="auto">Auto-detect</option>
                <option value="yes">Yes — start day</option>
                <option value="no">No</option>
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="shift-break">Unpaid break</Label>
              <select
                id="shift-break"
                className={selectClassName}
                value={form.breakOverrideMinutes ?? ''}
                onChange={(e) => setForm({ ...form, breakOverrideMinutes: e.target.value === '' ? null : Number(e.target.value) })}
              >
                <option value="">Default ({defaultBreakMinutes} min)</option>
                {[0, 15, 30, 45, 60].map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? 'No break' : `${m} min`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending} className="h-10 w-full sm:w-auto sm:px-6">
              {pending ? 'Saving…' : shift ? 'Save changes' : 'Add shift'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function initial(shift: EditableShift | undefined, defaultDate: string): ShiftForm {
  if (!shift) return { date: defaultDate, start: '17:00', end: '01:00', holidayOverride: 'auto', breakOverrideMinutes: null };
  return {
    date: shift.localDate,
    start: toHHMM(shift.localStartMin),
    end: toHHMM(shift.localEndMin),
    holidayOverride: shift.holidayOverride,
    breakOverrideMinutes: shift.breakOverrideMinutes,
  };
}
