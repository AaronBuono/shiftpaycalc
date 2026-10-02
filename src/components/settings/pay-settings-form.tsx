'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { saveSettings, type SettingsForm } from '@/app/actions';
import { selectClassName } from '@/components/shifts/shift-editor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DAY_NAMES } from '@/lib/pay/dates';
import type { Loading, PayRules } from '@/lib/pay/rules';
import { cn } from '@/lib/utils';

// Mon..Sun display order, mapped to 0=Sun..6=Sat indices.
const DISPLAY_DAYS = [1, 2, 3, 4, 5, 6, 0];

const TIME_ZONES = [
  'Australia/Melbourne',
  'Australia/Sydney',
  'Australia/Hobart',
  'Australia/Brisbane',
  'Australia/Adelaide',
  'Australia/Darwin',
  'Australia/Perth',
];

const toHHMM = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const fromHHMM = (v: string, isEnd: boolean) => {
  const m = Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
  return isEnd && m === 0 ? 1440 : m; // an end of 00:00 means midnight
};

export type InitialSettings = Omit<SettingsForm, 'keepPastRates'>;

export function PaySettingsForm({ initial, rateVersions }: { initial: InitialSettings; rateVersions: string[] }) {
  const [form, setForm] = useState<SettingsForm>({ ...initial, keepPastRates: true });
  const [pending, startTransition] = useTransition();
  const rules = form.rules;
  const ratesChanged = JSON.stringify(rules) !== JSON.stringify(initial.rules);

  const setRules = (patch: Partial<PayRules>) => setForm((f) => ({ ...f, rules: { ...f.rules, ...patch } }));
  const setLoading = (i: number, patch: Partial<Loading>) =>
    setRules({ loadings: rules.loadings.map((l, j) => (i === j ? { ...l, ...patch } : l)) });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await saveSettings(form);
      if (res.ok) toast.success('Settings saved', { description: res.message });
      else toast.error(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-10">
      <Section title="Pay rates" description="Hourly rate for each day. Public holidays replace the day rate and no loadings are added.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {DISPLAY_DAYS.map((dow) => (
            <MoneyField
              key={dow}
              id={`rate-${dow}`}
              label={DAY_NAMES[dow]}
              value={rules.dayRates[dow]}
              onChange={(v) => setRules({ dayRates: rules.dayRates.map((r, i) => (i === dow ? v : r)) })}
            />
          ))}
          <MoneyField id="rate-ph" label="Public holiday" value={rules.publicHolidayRate} onChange={(v) => setRules({ publicHolidayRate: v })} />
          <MoneyField id="rate-base" label="Base (reference)" value={rules.baseRate} onChange={(v) => setRules({ baseRate: v })} />
        </div>
      </Section>

      <Section title="Loadings" description="Added per hour on top of the day rate, during these hours on the ticked days.">
        <div className="grid gap-4">
          {rules.loadings.map((l, i) => (
            <div key={l.kind} className="bg-secondary grid gap-3 rounded-lg p-3">
              <p className={cn('text-sm font-semibold', l.kind === 'evening' ? 'text-evening' : 'text-night')}>
                {l.kind === 'evening' ? 'Evening' : 'Night'}
              </p>
              <div className="grid grid-cols-3 gap-3">
                <MoneyField id={`load-${i}-amt`} label="Amount /hr" value={l.amount} onChange={(v) => setLoading(i, { amount: v })} />
                <div className="grid gap-1.5">
                  <Label htmlFor={`load-${i}-from`}>From</Label>
                  <Input
                    id={`load-${i}-from`}
                    type="time"
                    step={900}
                    value={toHHMM(l.startMin)}
                    onChange={(e) => setLoading(i, { startMin: fromHHMM(e.target.value, false) })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`load-${i}-to`}>Until</Label>
                  <Input
                    id={`load-${i}-to`}
                    type="time"
                    step={900}
                    value={toHHMM(l.endMin)}
                    onChange={(e) => setLoading(i, { endMin: fromHHMM(e.target.value, true) })}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DISPLAY_DAYS.map((dow) => {
                  const on = l.days.includes(dow);
                  return (
                    <button
                      type="button"
                      key={dow}
                      aria-pressed={on}
                      onClick={() => setLoading(i, { days: on ? l.days.filter((d) => d !== dow) : [...l.days, dow] })}
                      className={cn(
                        'h-8 w-11 rounded-md border text-xs font-medium transition-colors',
                        on ? 'border-primary bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {DAY_NAMES[dow]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Unpaid break" description="Taken off the end of the shift. You can override it on any single shift.">
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <div className="grid gap-1.5">
            <Label htmlFor="break-len">Length</Label>
            <select
              id="break-len"
              className={selectClassName}
              value={rules.breakMinutes}
              onChange={(e) => setRules({ breakMinutes: Number(e.target.value) })}
            >
              {[0, 15, 30, 45, 60].map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? 'No break' : `${m} min`}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="break-after">For shifts longer than</Label>
            <select
              id="break-after"
              className={selectClassName}
              value={rules.breakThresholdMinutes}
              onChange={(e) => setRules({ breakThresholdMinutes: Number(e.target.value) })}
            >
              {[4, 4.5, 5, 5.5, 6, 6.5, 7, 8].map((h) => (
                <option key={h} value={h * 60}>
                  {h} hours
                </option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      {ratesChanged && (
        <div className="border-primary/30 bg-primary/5 grid gap-2 rounded-lg border p-3 text-sm">
          <p className="font-medium">Apply the new rates to…</p>
          <label className="flex items-center gap-2">
            <input type="radio" checked={form.keepPastRates} onChange={() => setForm({ ...form, keepPastRates: true })} className="accent-primary" />
            Shifts from today on — past shifts keep their old rates
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={!form.keepPastRates} onChange={() => setForm({ ...form, keepPastRates: false })} className="accent-primary" />
            All shifts, including past ones (e.g. fixing a typo)
          </label>
        </div>
      )}

      <Section title="Pay period" description="How the dashboard groups shifts.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="period-type">Paid</Label>
            <select
              id="period-type"
              className={selectClassName}
              value={form.periodType}
              onChange={(e) => setForm({ ...form, periodType: e.target.value as SettingsForm['periodType'] })}
            >
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="period-start">Starts on</Label>
            <select
              id="period-start"
              className={selectClassName}
              value={form.periodStartDow}
              onChange={(e) => setForm({ ...form, periodStartDow: Number(e.target.value) })}
            >
              {DISPLAY_DAYS.map((d) => (
                <option key={d} value={d}>
                  {DAY_NAMES[d]}
                </option>
              ))}
            </select>
          </div>
          {form.periodType === 'fortnightly' && (
            <div className="col-span-2 grid gap-1.5 sm:col-span-1">
              <Label htmlFor="period-anchor">A fortnight that starts on</Label>
              <Input
                id="period-anchor"
                type="date"
                value={form.periodAnchorDate}
                onChange={(e) => setForm({ ...form, periodAnchorDate: e.target.value })}
              />
            </div>
          )}
        </div>
      </Section>

      <Section title="Holidays & time zone" description="Public holidays for your state are marked automatically.">
        <div className="grid gap-4 sm:max-w-md">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="state">State</Label>
              <select id="state" className={selectClassName} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}>
                <option value="VIC">Victoria</option>
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tz">Time zone</Label>
              <select id="tz" className={selectClassName} value={form.timeZone} onChange={(e) => setForm({ ...form, timeZone: e.target.value })}>
                {TIME_ZONES.map((z) => (
                  <option key={z} value={z}>
                    {z.replace('Australia/', '')}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              Melbourne Cup Day
              <span className="text-muted-foreground block text-xs">Metro Melbourne only — turn off if you’re regional.</span>
            </span>
            <Switch checked={form.melbourneCup} onCheckedChange={(v) => setForm({ ...form, melbourneCup: v })} />
          </label>
        </div>
      </Section>

      <div className="bg-background/95 sticky bottom-16 flex items-center gap-3 border-t py-3 backdrop-blur md:bottom-0">
        <Button type="submit" disabled={pending} className="h-10 px-6">
          {pending ? 'Saving…' : 'Save settings'}
        </Button>
        {rateVersions.length > 1 && (
          <p className="text-muted-foreground text-xs">
            Rate history: {rateVersions.length} versions, latest from {rateVersions[rateVersions.length - 1]}
          </p>
        )}
      </div>
    </form>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4">
      <div>
        <h2 className="text-lg font-medium">{title}</h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {children}
    </section>
  );
}

function MoneyField({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(value.toFixed(2));
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">$</span>
        <Input
          id={id}
          inputMode="decimal"
          className="pl-6 font-mono tabular-nums"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(Math.round(n * 100) / 100);
          }}
          onBlur={() => setText(value.toFixed(2))}
        />
      </div>
    </div>
  );
}
