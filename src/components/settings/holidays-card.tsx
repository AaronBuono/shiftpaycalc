'use client';

import { X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { addCustomHoliday, removeCustomHoliday } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/format';

type Holiday = { date: string; name: string; regional?: string | null };

export function HolidaysCard({
  upcoming,
  custom,
  melbourneCup,
}: {
  upcoming: Holiday[];
  custom: Holiday[];
  melbourneCup: boolean;
}) {
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [pending, startTransition] = useTransition();

  function add(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await addCustomHoliday(date, name);
      if (res.ok) {
        setDate('');
        setName('');
        toast.success('Holiday added');
      } else toast.error(res.error);
    });
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <h3 className="mb-2 text-sm font-medium">Coming up</h3>
        <ul className="divide-y rounded-lg border text-sm">
          {upcoming.length === 0 && <li className="text-muted-foreground px-3 py-2">No upcoming holidays loaded.</li>}
          {upcoming.map((h) => {
            const off = h.regional === 'melbourne-cup' && !melbourneCup;
            return (
              <li key={h.date} className="flex justify-between gap-3 px-3 py-2">
                <span className={off ? 'text-muted-foreground line-through' : ''}>{h.name}</span>
                <span className="text-muted-foreground shrink-0 tabular-nums">{formatDate(h.date, { year: true })}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium">Your local holidays</h3>
        <ul className="mb-3 divide-y rounded-lg border text-sm">
          {custom.length === 0 && <li className="text-muted-foreground px-3 py-2">None — add one for a regional show day etc.</li>}
          {custom.map((h) => (
            <li key={h.date} className="flex items-center justify-between gap-3 px-3 py-1.5">
              <span>{h.name}</span>
              <span className="flex items-center gap-2">
                <span className="text-muted-foreground tabular-nums">{formatDate(h.date, { year: true })}</span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove ${h.name}`}
                  disabled={pending}
                  onClick={() => startTransition(async () => void (await removeCustomHoliday(h.date)))}
                >
                  <X />
                </Button>
              </span>
            </li>
          ))}
        </ul>
        <form onSubmit={add} className="flex gap-2">
          <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="w-40" aria-label="Holiday date" />
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Holiday name" />
          <Button type="submit" variant="secondary" disabled={pending || !date} className="h-10">
            Add
          </Button>
        </form>
      </div>
    </div>
  );
}
