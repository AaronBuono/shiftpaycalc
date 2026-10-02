'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { disconnectCalendar, saveCalendarUrl } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatRelative, syncSummaryText } from '@/lib/format';
import type { SyncSummary } from '@/lib/sync-types';

export type CalendarInfo = {
  lastSyncedAt: number | null;
  lastStatus: 'ok' | 'error' | null;
  lastError: string | null;
  lastSummary: string | null;
} | null;

export function CalendarForm({ calendar }: { calendar: CalendarInfo }) {
  const [url, setUrl] = useState('');
  const [editing, setEditing] = useState(!calendar);
  const [pending, startTransition] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await saveCalendarUrl(url);
      if (res.ok) {
        toast.success('Roster connected', { description: res.data ? syncSummaryText(res.data) : undefined });
        setUrl('');
        setEditing(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  function disconnect() {
    if (!confirm('Disconnect your roster? Shifts already synced are kept.')) return;
    startTransition(async () => {
      const res = await disconnectCalendar();
      if (res.ok) {
        toast.success('Roster disconnected');
        setEditing(true);
      } else toast.error(res.error);
    });
  }

  let summary: SyncSummary | null = null;
  try {
    summary = calendar?.lastSummary ? (JSON.parse(calendar.lastSummary) as SyncSummary) : null;
  } catch {}

  return (
    <div className="grid gap-4">
      {calendar && (
        <div className="bg-secondary flex items-start gap-3 rounded-lg p-3 text-sm">
          {calendar.lastStatus === 'error' ? (
            <XCircle className="text-destructive mt-0.5 size-5 shrink-0" />
          ) : (
            <CheckCircle2 className="text-primary mt-0.5 size-5 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-medium">Humanforce roster connected</p>
            <p className="text-muted-foreground text-xs">
              {calendar.lastSyncedAt ? `Last synced ${formatRelative(calendar.lastSyncedAt)}` : 'Not synced yet'}
              {calendar.lastStatus === 'ok' && summary ? ` · ${syncSummaryText(summary)}` : ''}
            </p>
            {calendar.lastStatus === 'error' && calendar.lastError && <p className="text-destructive mt-1 text-xs">{calendar.lastError}</p>}
            <p className="text-muted-foreground mt-1 text-xs">Syncs automatically once a day. The link is stored encrypted and never shown again.</p>
          </div>
        </div>
      )}

      {editing ? (
        <form onSubmit={save} className="grid gap-2">
          <Label htmlFor="calendar-url">{calendar ? 'New calendar link' : 'Calendar link'}</Label>
          <Input
            id="calendar-url"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="webcal://…"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            In Humanforce, open your roster’s calendar subscription and copy the webcal link. Treat it like a password — anyone with it can see your roster.
          </p>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending || !url} className="h-10 px-4">
              {pending ? 'Connecting…' : 'Save & sync'}
            </Button>
            {calendar && (
              <Button type="button" variant="ghost" className="h-10" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      ) : (
        <div className="flex gap-2">
          <Button variant="secondary" className="h-10 px-4" onClick={() => setEditing(true)}>
            Replace link
          </Button>
          <Button variant="destructive" className="h-10 px-4" disabled={pending} onClick={disconnect}>
            Disconnect
          </Button>
        </div>
      )}
    </div>
  );
}
