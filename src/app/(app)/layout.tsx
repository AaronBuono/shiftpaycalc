import { AppShell } from '@/components/dashboard/app-shell';
import { requireUser } from '@/lib/auth';
import { getCalendarStatus } from '@/lib/data';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const calendar = await getCalendarStatus(user.id);
  return (
    <AppShell user={{ name: user.name, email: user.email }} calendar={calendar}>
      {children}
    </AppShell>
  );
}
