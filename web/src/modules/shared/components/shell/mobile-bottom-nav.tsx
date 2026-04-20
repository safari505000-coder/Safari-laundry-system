import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import type { SafariRole } from '@/lib/api';
import { getSidebarNavGroupsForRole } from '@/modules/shared/nav/resolve-sidebar-nav';
import type { NavGroupTone, NavItem } from '@/modules/shared/nav/nav-types';
import {
  branchesItem,
  collectionsItem,
  customersItem,
  dashboardItem,
  driverFieldExpensesItem,
  expensesItem,
  financialsItem,
  invoicesDataItem,
  myCustodyItem,
  myDailySalesItem,
  myDepositsItem,
  ordersItem,
  posItem,
  reportsItem,
  subscribersItem,
  subscriptionsItem,
} from '@/modules/shared/nav/nav-items';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/modules/shared/components/ui/sheet';
import { cn } from '@/lib/utils';

/**
 * V19.3 — Tone classes shared with the desktop sidebar. Keeps the mobile
 * "More" sheet aligned with the six coloured OWNER islands so users get
 * the same visual hierarchy on phones as on desktop.
 */
const GROUP_TONE_CLASSES: Record<NavGroupTone, { dot: string; text: string }> = {
  blue: { dot: 'bg-sky-500', text: 'text-sky-700 dark:text-sky-300' },
  green: { dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' },
  orange: { dot: 'bg-orange-500', text: 'text-orange-700 dark:text-orange-300' },
  purple: { dot: 'bg-violet-500', text: 'text-violet-700 dark:text-violet-300' },
  red: { dot: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-300' },
  gray: { dot: 'bg-zinc-400', text: 'text-muted-foreground' },
};

/**
 * V18.0 — Keeta-style bottom navigation bar. Shows the four most relevant
 * destinations per role, plus a "More" button that slides the full nav in a
 * sheet. The sidebar is hidden on mobile (<md), so this component is the
 * primary navigation on phones/tablets in portrait.
 *
 * All entries reference the canonical items in `nav-items.ts` so role
 * changes only need to happen in one place. The "More" sheet is rendered
 * from the same sidebar resolver used by desktop, which guarantees no
 * divergence between the two surfaces.
 */
function bottomNavItemsForRole(role: SafariRole | undefined): NavItem[] {
  switch (role) {
    case 'OWNER':
    case 'GENERAL_MANAGER':
      return [
        { ...financialsItem, labelKey: 'nav.financials' },
        ordersItem,
        subscribersItem,
        branchesItem,
      ];
    case 'MANAGER':
      return [dashboardItem, posItem, ordersItem, myCustodyItem];
    case 'DRIVER':
      return [posItem, myDailySalesItem, myDepositsItem, driverFieldExpensesItem];
    case 'CALL_CENTER':
      return [customersItem, collectionsItem, subscribersItem, subscriptionsItem];
    case 'ACCOUNTANT':
      return [dashboardItem, reportsItem, invoicesDataItem, expensesItem];
    case 'SUPERVISOR':
    case 'VIEWER':
    default:
      return [dashboardItem, ordersItem, reportsItem, invoicesDataItem];
  }
}

function tabClass(active: boolean) {
  return cn(
    'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 text-[10px] font-medium transition-colors',
    active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
  );
}

export function MobileBottomNav() {
  const { t } = useTranslation();
  const { user, hasRole } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  const role = user?.safariRole;

  const items = useMemo(
    () => bottomNavItemsForRole(role).filter((i) => hasRole(...i.roles)),
    [role, hasRole],
  );

  const fullNavGroups = useMemo(() => {
    const groups = getSidebarNavGroupsForRole(role);
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((i) => hasRole(...i.roles)),
      }))
      .filter((g) => g.items.length > 0);
  }, [hasRole, role]);

  if (!user) return null;
  if (role === 'DRIVER') {
    /*
     * Drivers operate from the POS / full-screen islands and don't render
     * `ExecutiveShell`, so the main bottom nav doesn't apply to them. The
     * driver bottom actions live inside their own pages.
     */
    return null;
  }

  return (
    <nav
      className={cn(
        'print:hidden md:hidden',
        'fixed inset-x-0 bottom-0 z-40 flex h-14 items-stretch border-t border-border bg-card/95 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] backdrop-blur-sm',
        'supports-[padding:env(safe-area-inset-bottom)]:pb-[env(safe-area-inset-bottom)]',
      )}
      aria-label={t('nav.bottomNav', 'Navigation')}
    >
      {items.map(({ to, labelKey, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) => tabClass(isActive)}
        >
          <Icon className="h-[20px] w-[20px]" aria-hidden />
          <span className="w-full truncate text-center">{t(labelKey)}</span>
        </NavLink>
      ))}

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetTrigger
          className={tabClass(false)}
          aria-label={t('nav.more', 'More')}
        >
          <Menu className="h-[20px] w-[20px]" aria-hidden />
          <span className="w-full truncate text-center">
            {t('nav.more', 'More')}
          </span>
        </SheetTrigger>
        <SheetContent
          side="bottom"
          className="max-h-[85vh] overflow-y-auto rounded-t-2xl p-0"
        >
          <SheetHeader className="border-b border-border">
            <SheetTitle>{t('nav.more', 'More')}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 p-4 pb-8">
            {fullNavGroups.map((group) => {
              const tone = group.tone ? GROUP_TONE_CLASSES[group.tone] : null;
              return (
              <div key={group.labelKey} className="space-y-1">
                <p
                  className={cn(
                    'flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider',
                    tone ? tone.text : 'text-muted-foreground',
                  )}
                >
                  {tone ?
                    <span
                      aria-hidden
                      className={cn('h-1.5 w-1.5 rounded-full', tone.dot)}
                    />
                  : null}
                  {t(group.labelKey)}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {group.items.map(({ to, labelKey, icon: Icon }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={to === '/'}
                      onClick={() => setMoreOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-medium transition-colors',
                          isActive
                            ? 'border-primary/40 bg-primary/10 text-primary'
                            : 'text-foreground hover:bg-muted',
                        )
                      }
                    >
                      <Icon className="h-4 w-4 opacity-80" aria-hidden />
                      <span className="truncate">{t(labelKey)}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
