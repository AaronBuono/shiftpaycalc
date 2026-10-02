import type { CSSProperties, ReactNode } from 'react';

import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DashboardSidebar } from './sidebar';
import { DashboardTopbar, type CalendarStatus } from './topbar';
import './dashboard.css';

export function AppShell({
  children,
  user,
  calendar,
}: {
  children: ReactNode;
  user: { name: string; email: string };
  calendar: CalendarStatus | null;
}) {
  return (
    <TooltipProvider>
      <SidebarProvider
        defaultOpen={true}
        className="app-shell h-svh overflow-hidden"
        style={
          {
            '--sidebar-width': '16rem',
            '--sidebar-width-icon': '5rem',
          } as CSSProperties
        }
      >
        <DashboardSidebar user={user} />
        <main className="flex-1 overflow-y-auto">
          <DashboardTopbar calendar={calendar} />
          <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8 max-md:mb-16">{children}</div>
        </main>
      </SidebarProvider>
    </TooltipProvider>
  );
}
