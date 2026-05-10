import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/modules/shared/components/ui/tabs';
import { useAuth } from '@/contexts/auth-context';
import { useRealtimeFinancialFeed } from '@/modules/finance';
import { useCcCustomer360 } from '../hooks/use-cc-customer-360';
import { useCcActiveDispatches } from '../hooks/use-cc-active-dispatches';
import { Customer360Header } from '../components/customer-360-header';
import { OverviewTab } from '../components/tabs/overview-tab';
import { DispatchTab } from '../components/tabs/dispatch-tab';
import { RiskTab } from '../components/tabs/risk-tab';
import { CustomerSearch } from '../components/customer-search';

/**
 * V19.x — Call-Center Customer 360 page.
 *
 * Tabs are intentionally limited to the four operational concerns
 * the CALL_CENTER role is authorised to act on:
 *   - Overview (summary)
 *   - Dispatch (the only place this role can write)
 *   - Risk (informational, derived from the same Customer 360 read)
 *
 * The Audit Timeline tab was REMOVED (per Option A in the hardening
 * brief): the CALL_CENTER role does not hold `VIEW_AUDIT_LOGS`, so a
 * conditionally-rendered tab would be a permanent dead branch in the
 * UI. Removing the tab outright keeps the codebase honest — every
 * tab the user can see is one they are guaranteed to be able to use.
 * If we ever need an audit view for CC, we will introduce a narrow
 * `GET /api/audit/logs?customerId=` policy at that time.
 */
type TabId = 'overview' | 'dispatch' | 'risk';
const ALL_TABS: readonly TabId[] = ['overview', 'dispatch', 'risk'];

function isTabId(v: string | null): v is TabId {
  return v !== null && (ALL_TABS as readonly string[]).includes(v);
}

export function CcCustomer360Page() {
  const { t } = useTranslation();
  const { customerId } = useParams<{ customerId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();

  // All hooks live above any early return — React's rules-of-hooks
  // require unconditional invocation order across renders. Inputs that
  // would normally short-circuit (no user, no customerId) feed `null`
  // into the data hooks instead of skipping them.
  const safeCustomerId = customerId ?? null;

  const requestedTab = searchParams.get('tab');
  const activeTab: TabId = isTabId(requestedTab) ? requestedTab : 'overview';

  const onTabChange = (next: string | null) => {
    if (typeof next !== 'string') return;
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  const customer360 = useCcCustomer360(safeCustomerId);
  // Single shared poll feeds both the dispatch tab and the risk tab.
  const dispatches = useCcActiveDispatches({
    customerId: safeCustomerId,
    pollMs: 10_000,
  });

  // V22 Phase 5 — Realtime adoption.
  //
  // Subscribe to the canonical `customer360` SSE channel scoped
  // to the current customer. The hook ONLY invalidates the
  // `financial:*` cache prefixes — it never reads `payload.*Kd`
  // and never sets cache values directly (locked in by
  // `v21-phase4-realtime-purity.test.ts`).
  //
  // The subsequent canonical refetch flows through
  // `useCcCustomer360` → `useFinancialQuery` → backend canonical
  // projection, preserving the V21 financial-truth invariant.
  useRealtimeFinancialFeed({
    channel: 'customer360',
    customerId: safeCustomerId,
    accessToken: token,
    enabled: Boolean(safeCustomerId && token),
    onEvent: () => {
      // Trigger a follow-up canonical fetch — the cache marker
      // was already moved to fetchedAt=0 by the hook itself, so
      // this just kicks the in-flight reload.
      customer360.reload();
    },
  });

  // Whenever the 360 reloads (after block/unblock/create dispatch),
  // also refresh dispatches so the header status badge and the
  // dispatch list stay in lockstep.
  const reloadAll = () => {
    customer360.reload();
    dispatches.reload();
  };

  // Keep document title fresh — useful when an agent has many tabs open.
  useEffect(() => {
    if (customer360.data) {
      const name =
        customer360.data.customer.displayName ??
        customer360.data.customer.phone;
      document.title = `${name} · 360 — Safari`;
    }
  }, [customer360.data]);

  // Page is gated by `ccDashboard.view` upstream (RequireAccess on the
  // route). Belt-and-suspenders fall-throughs:
  if (!user) return <Navigate to="/login" replace />;
  if (!customerId) return <Navigate to="/cc/dashboard" replace />;

  if (customer360.loading && !customer360.data) {
    return (
      <div className="space-y-4 p-4">
        <BackBar />
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t('common.loading', { defaultValue: 'جاري التحميل…' })}
        </div>
      </div>
    );
  }

  if (customer360.error || !customer360.data) {
    return (
      <div className="space-y-4 p-4">
        <BackBar />
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center text-sm text-destructive">
          {customer360.error ??
            t('callCenterDashboard.page.notFound', {
              defaultValue: 'لم نعثر على هذا العميل.',
            })}
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => customer360.reload()}
            >
              {t('common.retry', { defaultValue: 'إعادة المحاولة' })}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const data = customer360.data;
  const displayName = data.customer.displayName ?? data.customer.phone;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <BackBar />

      {/* Quick-jump search lives at the top so an agent can pivot to a
          different customer without going back to the dashboard. */}
      <div className="max-w-xl">
        <CustomerSearch />
      </div>

      <Customer360Header
        data={data}
        onMutated={reloadAll}
        onBack={() => navigate('/cc/dashboard')}
      />

      <Tabs
        value={activeTab}
        onValueChange={(v) => onTabChange(typeof v === 'string' ? v : null)}
      >
        <TabsList className="w-full max-w-2xl">
          <TabsTrigger value="overview">
            {t('callCenterDashboard.tabs.overview', {
              defaultValue: 'نظرة عامة',
            })}
          </TabsTrigger>
          <TabsTrigger value="dispatch">
            {t('callCenterDashboard.tabs.dispatch', {
              defaultValue: 'الإسناد',
            })}
          </TabsTrigger>
          <TabsTrigger value="risk">
            {t('callCenterDashboard.tabs.risk', {
              defaultValue: 'المخاطرة',
            })}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab
            data={data}
            latestDispatch={dispatches.rows[0] ?? null}
          />
        </TabsContent>

        <TabsContent value="dispatch" className="mt-4">
          <DispatchTab
            customerId={customerId}
            customerName={displayName}
            isCustomerBlocked={data.statement.financials.isBlocked}
          />
        </TabsContent>

        <TabsContent value="risk" className="mt-4">
          <RiskTab data={data} customerDispatches={dispatches.rows} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BackBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/cc/dashboard')}
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('callCenterDashboard.page.backToSearch', {
          defaultValue: 'رجوع للبحث',
        })}
      </Button>
    </div>
  );
}
