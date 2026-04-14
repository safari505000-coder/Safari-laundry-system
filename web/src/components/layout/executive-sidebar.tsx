import {
  Banknote,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Package,
  Sparkles,
  Truck,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useNavigate } from 'react-router-dom';
import { BrandLogo } from '@/components/layout/brand-logo';
import { useAuth } from '@/contexts/auth-context';
import type { SafariRole } from '@/lib/api';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const SIDEBAR_COLLAPSED_KEY = 'executive-sidebar-collapsed';

type NavItem = {
  to: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  roles: SafariRole[];
};

const dashboardItem: NavItem = {
  to: '/',
  labelKey: 'nav.dashboard',
  icon: LayoutDashboard,
  roles: [
    'OWNER',
    'MANAGER',
    'DRIVER',
    'CALL_CENTER',
    'ACCOUNTANT',
    'SUPERVISOR',
    'VIEWER',
  ],
};

const subscriptionsItem: NavItem = {
  to: '/subscriptions',
  labelKey: 'nav.subscriptions',
  icon: Sparkles,
  roles: ['OWNER', 'CALL_CENTER'],
};

const ordersItem: NavItem = {
  to: '/orders',
  labelKey: 'nav.orders',
  icon: Package,
  roles: [
    'OWNER',
    'MANAGER',
    'DRIVER',
    'CALL_CENTER',
    'ACCOUNTANT',
    'SUPERVISOR',
    'VIEWER',
  ],
};

const shiftsItem: NavItem = {
  to: '/shifts',
  labelKey: 'nav.shifts',
  icon: Truck,
  roles: [
    'OWNER',
    'MANAGER',
    'DRIVER',
    'SUPERVISOR',
    'ACCOUNTANT',
    'VIEWER',
  ],
};

const financialsItem: NavItem = {
  to: '/financials',
  labelKey: 'nav.financials',
  icon: Banknote,
  roles: ['OWNER', 'MANAGER', 'ACCOUNTANT', 'SUPERVISOR', 'VIEWER'],
};

const teamItem: NavItem = {
  to: '/team',
  labelKey: 'nav.team',
  icon: Users,
  roles: ['OWNER'],
};

const navGroups: { labelKey: string; items: NavItem[] }[] = [
  { labelKey: 'nav.groupMain', items: [dashboardItem, subscriptionsItem] },
  { labelKey: 'nav.groupOperations', items: [ordersItem, shiftsItem] },
  { labelKey: 'nav.groupFinance', items: [financialsItem] },
  { labelKey: 'nav.groupSettings', items: [teamItem] },
];

function navClass(active: boolean, collapsed: boolean) {
  return cn(
    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
    collapsed && 'justify-center px-0',
    active ?
      'bg-primary/12 text-primary'
    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  );
}

export function ExecutiveSidebar() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, logout, hasRole } = useAuth();
  const rtl = i18n.language.startsWith('ar');

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return typeof localStorage !== 'undefined' &&
        localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const filteredGroups = useMemo(() => {
    return navGroups
      .map((g) => ({
        ...g,
        items: g.items.filter((i) => hasRole(...i.roles)),
      }))
      .filter((g) => g.items.length > 0);
  }, [hasRole]);

  const initials =
    (user?.fullName
      ?.split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)) ||
    user?.username?.slice(0, 2).toUpperCase() ||
    'SF';

  const roleLabel =
    user?.safariRole ?
      t(`roles.${user.safariRole}`, {
        defaultValue: user.safariRole.replace('_', ' '),
      })
    : '';

  const CollapseIcon =
    collapsed ?
      rtl ?
        ChevronLeft
      : ChevronRight
    : rtl ?
      ChevronRight
    : ChevronLeft;

  return (
    <aside
      className={cn(
        'flex h-svh shrink-0 flex-col border-e border-border bg-card shadow-sm transition-[width] duration-200 ease-out',
        collapsed ? 'w-[4.25rem]' : 'w-64',
      )}
    >
      <div
        className={cn(
          'flex h-16 items-center gap-2 border-b border-border px-3',
          collapsed &&
            'h-auto min-h-16 flex-col justify-center gap-2 px-2 py-3',
        )}
      >
        <BrandLogo
          className={cn(
            'shrink-0',
            collapsed ? 'max-h-9 max-w-[48px] object-contain' : '',
          )}
        />
        {!collapsed ?
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {t('nav.brandLine')}
            </p>
            <p className="truncate text-sm font-semibold text-foreground">
              {t('nav.brandTitle')}
            </p>
          </div>
        : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground',
            collapsed ? '' : 'ms-auto',
          )}
          aria-label={
            collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')
          }
          onClick={() => setCollapsed((c) => !c)}
        >
          <CollapseIcon className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-2">
        {filteredGroups.map((group) => (
          <div key={group.labelKey} className="space-y-0.5">
            {!collapsed ?
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                {t(group.labelKey)}
              </p>
            : null}
            {group.items.map(({ to, labelKey, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                title={collapsed ? t(labelKey) : undefined}
                className={({ isActive }) => navClass(isActive, collapsed)}
              >
                <Icon className="h-[18px] w-[18px] shrink-0 opacity-90" aria-hidden />
                {!collapsed ? <span>{t(labelKey)}</span> : null}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            className={buttonVariants({
              variant: 'ghost',
              className: cn(
                'h-auto w-full gap-3 px-2 py-2 text-start text-foreground hover:bg-muted',
                collapsed && 'justify-center px-0',
              ),
            })}
            title={collapsed ? user?.fullName ?? undefined : undefined}
          >
            <Avatar className="h-9 w-9 border border-border">
              <AvatarFallback className="bg-muted text-xs text-muted-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            {!collapsed ?
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user?.fullName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {roleLabel} · @{user?.username}
                </p>
              </div>
            : null}
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="start" side="top">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{user?.fullName}</p>
                  <p className="text-xs text-muted-foreground">
                    @{user?.username}
                  </p>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                window.setTimeout(() => {
                  logout();
                  navigate('/login', { replace: true });
                }, 0);
              }}
            >
              <LogOut className="me-2 h-4 w-4" />
              {t('nav.signOut')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
