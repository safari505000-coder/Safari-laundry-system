import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { X } from 'lucide-react';
import { ExecutiveHeader } from '@/modules/shared/components/shell/executive-header';
import { OperatorRouteHint } from '@/modules/shared/components/shell/operator-route-hint';
import { ExecutiveSidebar } from '@/modules/shared/components/shell/executive-sidebar';
import { shellGuidanceForRole } from '@/modules/shared/shell/resolve-shell-guidance';
import { useAuth } from '@/contexts/auth-context';

/**
 * V19.9.5 — Executive shell.
 *
 * Changes from V19.4:
 *  - Guidance banner is now dismissible per role; once the user
 *    clicks the X, the banner stays hidden across page navigations
 *    (localStorage-scoped by `safariRole` so every account keeps
 *    its own preference, and resetting the key brings the tip back).
 *  - Main content padding reduced from p-10 to p-6 at the lg
 *    breakpoint so dense finance/invoice screens have more horizontal
 *    runway without changing card widths.
 *
 * V19.15 — Mobile navigation migrated from a bottom tab bar to a
 * side drawer (rendered inside `MobileBottomNav` for backwards-compat
 * naming). The drawer's trigger is a floating button at the
 * reading-start corner, so the `<main>` wrapper no longer needs the
 * `pb-20` safe-area padding that used to sit under the old bar.
 *
 * Note: `MobileBottomNav` still lives on `AuthLayout` so full-screen
 * islands (/pos, /admin/live-monitor) keep the drawer trigger visible.
 */
function guidanceDismissKey(role: string | undefined | null): string {
  return `executive-shell-guidance-dismissed:${role ?? 'anon'}`;
}

export function ExecutiveShell() {
  const { user } = useAuth();
  const guidance = shellGuidanceForRole(user?.safariRole);
  const storageKey = guidanceDismissKey(user?.safariRole);

  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return (
        typeof localStorage !== 'undefined' &&
        localStorage.getItem(storageKey) === '1'
      );
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(storageKey) === '1');
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(storageKey, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }, [storageKey]);

  return (
    <div className="flex min-h-svh max-w-[100vw] overflow-x-hidden bg-muted/40">
      <ExecutiveSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <ExecutiveHeader />
        <main
          className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 print:p-2 sm:p-6 lg:p-8"
        >
          <div className="mx-auto min-w-0 max-w-6xl print:max-w-none">
            {!dismissed && guidance ? (
              <div className="relative mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 pe-10 text-sm text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-200">
                {guidance}
                <button
                  type="button"
                  onClick={dismiss}
                  aria-label="إخفاء التنبيه"
                  className="absolute end-2 top-2 rounded-md p-1 text-sky-700/70 transition hover:bg-sky-100 hover:text-sky-900 dark:text-sky-200/70 dark:hover:bg-sky-900/40"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ) : null}
            <OperatorRouteHint />
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
