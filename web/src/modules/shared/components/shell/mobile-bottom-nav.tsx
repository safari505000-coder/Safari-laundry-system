import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { getSidebarNavGroupsForRole } from '@/modules/shared/nav/resolve-sidebar-nav';
import type { NavItem } from '@/modules/shared/nav/nav-types';
import {
  branchesItem,
  collectionsItem,
  customersItem,
  dashboardItem,
  expensesItem,
  financialsItem,
  invoicesDataItem,
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

type SafariRoleName =
  | 'OWNER'
  | 'MANAGER'
  | 'DRIVER'
  | 'CALL_CENTER'
  | 'ACCOUNTANT'
  | 'SUPERVISOR'
  | 'VIEWER';

const driverFieldExpensesItem: NavItem = {
  to: '/my-field-expenses',
  labelKey: 'nav.fieldExpenses',
  icon: expensesItem.icon,
  roles: ['DRIVER'],
};

const managerCustodyItem: NavItem = {
  to: '/manager/custody',
  labelKey: 'nav.myCustody',
  icon: invoicesDataItem.icon,
  roles: ['MANAGER'],
};

/**
 * V18.0 — Keeta-style bottom navigation bar. Shows the four most relevant
 * destinations per role, plus a "More" button that slides the full nav in a
 * sheet. The sidebar is hidden on mobile (<md), so this component is the
 * primary navigation on phones/tablets in portrait.
 */
function bottomNavItemsForRole(role: SafariRoleName | undefined): NavItem[] {
  switch (role) {
    case 'OWNER':
      return [
        { ...financialsItem, labelKey: 'nav.financials' },
        ordersItem,
        subscribersItem,
        branchesItem,
      ];
    case 'MANAGER':
      return [dashboardItem, posItem, ordersItem, managerCustodyItem];
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

  const role = user?.safariRole as SafariRoleName | undefined;

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
            {fullNavGroups.map((group) => (
              <div key={group.labelKey} className="space-y-1">
                <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
