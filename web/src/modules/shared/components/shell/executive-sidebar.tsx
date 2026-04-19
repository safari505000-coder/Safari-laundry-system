import {
  ChevronLeft,
  ChevronRight,
  LogOut,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useNavigate } from 'react-router-dom';
import { BrandLogo } from '@/modules/shared/components/brand-logo';
import { getSidebarNavGroupsForRole } from '@/modules/shared/nav/resolve-sidebar-nav';
import { useAuth } from '@/contexts/auth-context';
import { Avatar, AvatarFallback } from '@/modules/shared/components/ui/avatar';
import { Button, buttonVariants } from '@/modules/shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/modules/shared/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const SIDEBAR_COLLAPSED_KEY = 'executive-sidebar-collapsed';

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
    const groups = getSidebarNavGroupsForRole(user?.safariRole);
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((i) => hasRole(...i.roles)),
      }))
      .filter((g) => g.items.length > 0);
  }, [hasRole, user?.safariRole]);

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
        'print:hidden hidden h-svh shrink-0 flex-col border-e border-border bg-card shadow-sm transition-[width] duration-200 ease-out md:flex',
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
        {/**
         * V1.5.5 — the sidebar brand is a single source of truth.
         * `BrandLogo` already renders "Safari Omni" + tagline when
         * expanded, so the old duplicate text block that also showed
         * the legacy group name ("Safari Express Laundries Group") has
         * been removed. Collapsed state keeps just the compact icon.
         */}
        <BrandLogo
          className={cn(
            'min-w-0 flex-1',
            collapsed ? 'max-h-9 max-w-[48px] shrink-0 object-contain' : '',
          )}
          compact={collapsed}
        />
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
