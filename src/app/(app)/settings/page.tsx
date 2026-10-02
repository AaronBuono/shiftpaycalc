import type { Metadata } from 'next';

import { CalendarForm } from '@/components/settings/calendar-form';
import { HolidaysCard } from '@/components/settings/holidays-card';
import { InvitesCard } from '@/components/settings/invites-card';
import { PaySettingsForm } from '@/components/settings/pay-settings-form';
import { SignOutButton } from '@/components/settings/sign-out-button';
import { isAdminEmail, requireUser } from '@/lib/auth';
import { getSettingsPage } from '@/lib/data';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const user = await requireUser();
  const admin = isAdminEmail(user.email);
  const data = await getSettingsPage(user.id, admin);
  const s = data.settings;

  return (
    <div className="mx-auto grid max-w-3xl gap-12">
      <Block id="calendar" title="Humanforce roster" description="Your shifts sync from your Humanforce calendar link.">
        <CalendarForm calendar={data.calendar} />
      </Block>

      <PaySettingsForm
        key={s.updatedAt.getTime()}
        rateVersions={data.rateVersions}
        initial={{
          rules: s.rules,
          timeZone: s.timeZone,
          state: s.state,
          melbourneCup: s.melbourneCup,
          periodType: s.periodType,
          periodStartDow: s.periodStartDow,
          periodAnchorDate: s.periodAnchorDate,
        }}
      />

      <Block title="Public holidays" description="Shifts on these days are paid at the public holiday rate — only the hours that fall on the day itself.">
        <HolidaysCard upcoming={data.upcoming} custom={data.custom} melbourneCup={s.melbourneCup} />
      </Block>

      {admin && (
        <Block title="Invites" description="Sign-up is invite only. Create a link for someone to join.">
          <InvitesCard invites={data.invites} />
        </Block>
      )}

      <Block title="Account" description={`Signed in as ${user.email}`}>
        <SignOutButton />
      </Block>
    </div>
  );
}

function Block({ id, title, description, children }: { id?: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section id={id} className="grid scroll-mt-28 gap-4">
      <div>
        <h2 className="text-lg font-medium">{title}</h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {children}
    </section>
  );
}
