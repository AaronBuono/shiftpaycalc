'use client';

import { CalendarClock, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ComponentType, SVGProps } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import { BackwardIcon, DashboardIcon, SettingsIcon } from './icons';
import { Logo } from './logo';

type NavItem = { href: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> };

export const NAVIGATION: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: DashboardIcon },
  { href: '/shifts', label: 'Shifts', icon: CalendarClock },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
];

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

const menuButtonClassName = cn(
  'h-11 gap-3 rounded-lg border border-transparent px-3.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:bg-muted active:text-foreground data-active:border-border data-active:bg-card data-active:text-primary data-active:hover:bg-card data-active:hover:text-primary [&_svg]:size-5 [&_svg]:text-foreground data-active:[&_svg]:text-primary',
  'group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!',
);

export function DashboardSidebar({ user }: { user: { name: string; email: string } }) {
  const { state, toggleSidebar } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const collapsed = state === 'collapsed';

  async function signOut() {
    await authClient.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader
          className={cn(
            'bg-sidebar h-16 flex-row items-center border-b p-0 transition-[padding] duration-200 md:h-21',
            collapsed ? 'justify-start px-5' : 'justify-between px-4.5',
          )}
        >
          {!collapsed ? (
            <>
              <Link aria-label="Shift Pay home" className="flex h-8 items-center gap-2" href="/">
                <Logo className="size-8" />
                <span className="text-xl font-bold tracking-tight">Shift Pay</span>
              </Link>
              <Button aria-label="Collapse sidebar" variant="secondary" size="icon-lg" onClick={toggleSidebar}>
                <BackwardIcon className="size-5" />
              </Button>
            </>
          ) : (
            <div className="group relative size-10">
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center transition-all duration-200 group-hover:scale-75 group-hover:opacity-0">
                <Logo className="size-7" />
              </div>
              <div className="pointer-events-none absolute inset-0 flex scale-75 items-center justify-center opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100">
                <Button aria-label="Expand sidebar" variant="secondary" size="icon-lg" onClick={toggleSidebar}>
                  <BackwardIcon className="size-5 rotate-180" />
                </Button>
              </div>
            </div>
          )}
        </SidebarHeader>

        <SidebarContent className="bg-sidebar px-4.5 pt-6 pb-2">
          <SidebarMenu className="gap-1.5">
            {NAVIGATION.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive(pathname, item.href)}
                  tooltip={item.label}
                  className={menuButtonClassName}
                >
                  <Link href={item.href}>
                    <item.icon />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter className="bg-sidebar border-t px-4.5 pt-3 pb-6">
          <SidebarMenu>
            <SidebarMenuItem className="flex items-center gap-2">
              {!collapsed && (
                <div className="min-w-0 flex-1 px-1">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="text-muted-foreground truncate text-xs">{user.email}</p>
                </div>
              )}
              <Button aria-label="Sign out" variant="ghost" size="icon" className="size-11" onClick={signOut}>
                <LogOut className="size-5" />
              </Button>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <MobileBottomNavigation pathname={pathname} />
    </>
  );
}

function MobileBottomNavigation({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Main"
      className="bg-sidebar fixed inset-x-0 bottom-0 z-50 flex h-16 items-center justify-around border-t px-2 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {NAVIGATION.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              buttonVariants({ variant: 'ghost' }),
              'hover:text-primary h-full flex-1 flex-col gap-1 rounded-none px-0 text-[11px] hover:bg-transparent',
              active ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <item.icon className="size-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
