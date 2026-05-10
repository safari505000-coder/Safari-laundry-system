import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Activity, ArrowLeft, ArrowRight } from 'lucide-react';
import { ConnectivityBadge } from '@/offline/connectivity-badge';
import { BranchSwitcher } from '@/modules/shared/components/branch-switcher';
import { LanguageToggle } from '@/components/i18n/language-toggle';
import { ThemeToggle } from '@/modules/shared/theme/theme-toggle';
import { Button } from '@/modules/shared/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { useRealtimeFinancialFeed } from '@/modules/finance';
import { RealtimeStatusBadge } from '@/modules/realtime-observability';

/**
 * V19.9.5 — Slim executive header.
 *
 * The sidebar already carries the brand mark, so the header no
 * longer duplicates it; it just reserves space for the three
 * contextual slots we actually need:
 *
 *   1. left:   mobile back button (only off-index) + page chrome slot
 *   2. center: a live clock (Kuwait time, minute precision, Latin
 *              digits per the V19.9.4 locale policy)
 *   3. right:  Safari Pulse shortcut (OWNER only) · branch switcher
 *              · language toggle · theme toggle
 *
 * The arrow direction still flips in RTL; everything else uses
 * `dir`-aware flex (gap + ms-/me- utilities) so we don't need the
 * old `startsWith('ar')` branching outside the arrow icon.
 *
 * V19.15 — On mobile, a floating drawer trigger (hamburger) is
 * rendered by `MobileBottomNav` at the reading-start corner with
 * `z-50`. To keep that button from visually crashing into the back
 * button / page chrome slot, the header reserves 3rem of leading
 * space (`ps-14`) on narrow viewports. Desktop (`md` and up) stays
 * on its original 1rem/1.5rem/2rem scale, since the drawer trigger
 * isn't rendered there.
 */
export function ExecutiveHeader() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { hasRole, token, user } = useAuth();
  const isOwner = hasRole('OWNER');
  const rtl = i18n.language?.startsWith('ar') ?? false;

  // V23 Phase 6 — shell-level realtime telemetry. The dashboards channel
  // is open to OWNER / GENERAL_MANAGER / MANAGER / ACCOUNTANT and customer360
  // is open to CALL_CENTER roles. The hook itself is a no-op when the user's
  // role is not allowed; the badge then renders an offline state which is
  // accurate for those operators.
  const realtimeChannel:
    | 'dashboards'
    | 'customer360'
    | null = (() => {
    const role = user?.safariRole;
    if (!role) return null;
    if (role === 'CALL_CENTER' || role === 'CALL_CENTER_SUPERVISOR')
      return 'customer360';
    if (
      role === 'OWNER' ||
      role === 'GENERAL_MANAGER' ||
      role === 'MANAGER' ||
      role === 'ACCOUNTANT'
    )
      return 'dashboards';
    return null;
  })();
  const realtimeState = useRealtimeFinancialFeed({
    channel: realtimeChannel ?? 'dashboards',
    accessToken: token,
    enabled: Boolean(realtimeChannel && token),
  });

  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const clockLabel = clock.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kuwait',
  });

  const isIndex = pathname === '/';
  const BackIcon = rtl ? ArrowRight : ArrowLeft;
  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  return (
    <header className="print:hidden sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card/90 py-0 pe-4 ps-14 shadow-sm backdrop-blur-sm sm:pe-6 sm:ps-6 md:ps-4 lg:pe-8 lg:ps-8">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {!isIndex ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={t('nav.back', 'رجوع')}
            className="h-9 w-9 shrink-0 md:hidden"
            onClick={goBack}
          >
            <BackIcon className="h-5 w-5" aria-hidden />
          </Button>
        ) : null}
        <span
          className="hidden rounded-md bg-muted/60 px-2 py-1 font-mono text-xs tabular-nums text-muted-foreground md:inline"
          aria-label="current time"
          title="Kuwait time"
        >
          {clockLabel}
        </span>
      </div>
      <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
        <ConnectivityBadge className="hidden min-[420px]:flex" />
        {realtimeChannel ? (
          <RealtimeStatusBadge
            state={realtimeState}
            className="hidden md:inline-flex"
          />
        ) : null}
        {isOwner ? (
          <Button
            type="button"
            variant="outline"
            className="h-9 border-primary/25 bg-background text-primary hover:bg-primary/5"
            onClick={() => navigate('/admin/live-monitor')}
          >
            <Activity className="me-2 h-4 w-4" aria-hidden />
            نبض سفاري
          </Button>
        ) : null}
        <BranchSwitcher />
        <LanguageToggle variant="outline" className="bg-background" />
        <ThemeToggle variant="outline" className="bg-background" />
      </div>
    </header>
  );
}
