import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router-dom';
import { LogOut, Menu } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { filterNavGroupsForUser } from '@/modules/shared/nav/filter-nav-groups';
import { getSidebarNavGroupsForRole } from '@/modules/shared/nav/resolve-sidebar-nav';
import type { NavGroupTone } from '@/modules/shared/nav/nav-types';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/modules/shared/components/ui/sheet';
import { cn } from '@/lib/utils';

/**
 * V19.15 — Tone → color map. Mirrors the dots used in `ExecutiveSidebar`
 * so the mobile drawer feels like a faithful miniature of the desktop
 * sidebar rather than a separate UI tree.
 */
const GROUP_TONE_CLASSES: Record<NavGroupTone, { dot: string; text: string }> = {
  blue: { dot: 'bg-sky-500', text: 'text-sky-700 dark:text-sky-300' },
  green: { dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' },
  orange: { dot: 'bg-orange-500', text: 'text-orange-700 dark:text-orange-300' },
  purple: { dot: 'bg-violet-500', text: 'text-violet-700 dark:text-violet-300' },
  red: { dot: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-300' },
  gray: { dot: 'bg-zinc-400', text: 'text-muted-foreground' },
};

function isNavRouteActive(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/';
  return pathname === to || pathname.startsWith(`${to}/`);
}

/**
 * V19.15 — Mobile nav is a **side drawer** (reading-start side) instead
 * of the previous 4-slot bottom tab bar.
 *
 * Why this changed:
 *  - The bottom bar only fit 4 destinations + a "More" overlay, which
 *    meant half the app was always one extra tap away. CC, MANAGER and
 *    ACCOUNTANT sidebars each have 6–8 real daily surfaces.
 *  - A side drawer displays every nav group at once with proper tone
 *    tinting, matching the desktop sidebar's hierarchy. Operators who
 *    already know the desktop app find their entries immediately.
 *  - Removing the bar frees ~56px of vertical space on every screen —
 *    an extra card or two fits on each list view without scrolling.
 *
 * Implementation:
 *  - Trigger is a fixed floating button anchored to the reading-start
 *    corner (top-start). `z-50` so it sits above the sticky header;
 *    the header itself reserves `ps-14` on mobile so the existing
 *    back button stays reachable.
 *  - The sheet itself uses the shared Radix-style primitive. We pass
 *    `side="right"` in Arabic (so the drawer slides from the user's
 *    reading start) and `side="left"` in English.
 *  - DRIVER role still returns `null` — drivers drive from full-screen
 *    island pages (POS, pending invoices, etc.) that ship their own
 *    in-page navigation. The role doesn't render the executive shell
 *    at all, so no trigger is needed there either.
 *  - File name kept as `mobile-bottom-nav.tsx` + export kept as
 *    `MobileBottomNav` on purpose: `AuthLayout` imports this name and
 *    renaming the module across the tree was more churn than the name
 *    inaccuracy is worth. The export still represents "the mobile
 *    navigation surface for this role", it just isn't a bottom bar
 *    anymore.
 */
export function MobileBottomNav() {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const role = user?.safariRole;
  const rtl = i18n.language?.startsWith('ar') ?? false;

  const navGroups = useMemo(() => {
    const groups = getSidebarNavGroupsForRole(role);
    return filterNavGroupsForUser(groups, user);
  }, [role, user]);

  if (!user) return null;
  if (role === 'DRIVER' && pathname === '/pos') {
    return null;
  }

  const displayName = user.fullName?.trim() || user.username;
  const userInitial = (displayName || '?').trim().charAt(0).toUpperCase();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={t('nav.openMenu', 'فتح القائمة')}
        className={cn(
          'print:hidden md:hidden',
          'fixed top-2.5 start-3 z-50 inline-flex h-10 w-10 items-center justify-center',
          'rounded-xl border border-border/60 bg-card/95 text-foreground shadow-md backdrop-blur-sm',
          'transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
          'supports-[padding:env(safe-area-inset-top)]:top-[calc(env(safe-area-inset-top)+0.5rem)]',
        )}
      >
        <Menu className="h-5 w-5" aria-hidden />
      </SheetTrigger>

      <SheetContent
        side={rtl ? 'right' : 'left'}
        className="w-[86vw] max-w-sm p-0"
      >
        <div className="flex h-full flex-col">
          {/* User identity header */}
          <SheetHeader className="border-b border-border bg-emerald-50/70 px-4 pb-4 pt-5 dark:bg-emerald-950/30">
            <div className="flex items-center gap-3">
              <div
                aria-hidden
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-base font-semibold text-white shadow-sm"
              >
                {userInitial}
              </div>
              <div className="min-w-0 flex-1 text-start">
                <SheetTitle className="truncate text-start text-base font-semibold">
                  {displayName}
                </SheetTitle>
                <p className="truncate text-xs text-muted-foreground">
                  {role}
                </p>
              </div>
            </div>
          </SheetHeader>

          {/* Grouped nav items */}
          <nav
            aria-label={t('nav.bottomNav', 'Navigation')}
            className="flex-1 overflow-y-auto p-3"
          >
            <div className="flex flex-col gap-4">
              {navGroups.map((group) => {
                const tone = group.tone
                  ? GROUP_TONE_CLASSES[group.tone]
                  : GROUP_TONE_CLASSES.gray;
                return (
                  <div key={group.labelKey} className="space-y-1">
                    <p
                      className={cn(
                        'flex items-center gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider',
                        tone.text,
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn('h-1.5 w-1.5 rounded-full', tone.dot)}
                      />
                      {t(group.labelKey)}
                    </p>
                    <div className="flex flex-col">
                      {group.items.map(({ to, labelKey, icon: Icon }) => (
                        <NavLink
                          key={to}
                          to={to}
                          end={to === '/'}
                          onClick={() => setOpen(false)}
                          className={() =>
                            cn(
                              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                              isNavRouteActive(pathname, to)
                                ? 'bg-primary/10 text-primary'
                                : 'text-foreground hover:bg-muted',
                            )
                          }
                        >
                          <Icon
                            className="h-4 w-4 shrink-0 opacity-80"
                            aria-hidden
                          />
                          <span className="truncate">{t(labelKey)}</span>
                        </NavLink>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </nav>

          {/* Footer — sign out */}
          <div className="border-t border-border p-3">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                logout();
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              <span>{t('nav.signOut', 'تسجيل الخروج')}</span>
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
