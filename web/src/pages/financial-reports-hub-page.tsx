import { useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ComponentType } from 'react';
import { BarChart3, CircleDollarSign, CreditCard, LineChart } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { can, type AccessKey } from '@/modules/shared/auth/access-matrix';
import { PageHeader } from '@/modules/shared/components/page';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/modules/shared/components/ui/tabs';
import { FinancialsPage } from '@/pages/financials-page';
import { FinancialCycleReportPage } from '@/pages/financial-cycle-report-page';
import { UnifiedLedgerPage } from '@/pages/unified-ledger-page';
import { KnetAudit } from '@/modules/accountant/pages/KnetAudit';
import { cn } from '@/lib/utils';

/**
 * V19.9.7 — Unified "Financial reports" hub (Owner / GM).
 *
 * V19.23 — Operational invoice/cash reports and AI insights moved to
 * `OperationalReportsHubPage` (`/operational-reports-hub`). This hub
 * keeps P&L, financial cycle, KNET audit, and unified ledger only.
 *
 * Underlying page components render as-is inside `<TabsContent>`;
 * permissions and data-loading are unchanged.
 *
 * The tab panels are mounted lazily by Base UI — only the active panel
 * is in the DOM, so switching tabs is cheap and no report fetches data
 * until the user actually opens its tab.
 *
 * Tab visibility uses access-matrix keys; if no tab is allowed the hub
 * redirects to `/`.
 *
 * The original routes (`/financials`, `/reports`, `/knet-audit`, …)
 * are NOT removed — they remain registered in `App.tsx` so any
 * bookmark, deep-link, or external integration keeps working.
 */

type TabDef = {
  id: string;
  labelKey: string;
  access: AccessKey;
  Component: ComponentType;
  Icon: ComponentType<{ className?: string }>;
};

const TABS: readonly TabDef[] = [
  {
    id: 'pnl',
    labelKey: 'reports.hubTabPnl',
    access: 'financials.view',
    Component: FinancialsPage,
    Icon: CircleDollarSign,
  },
  {
    id: 'cycle',
    labelKey: 'reports.hubTabCycle',
    access: 'financialCycleReport.view',
    Component: FinancialCycleReportPage,
    Icon: LineChart,
  },
  {
    id: 'knet',
    labelKey: 'reports.hubTabKnet',
    access: 'knetAudit.view',
    Component: KnetAudit,
    Icon: CreditCard,
  },
  {
    id: 'ledger',
    labelKey: 'reports.hubTabLedger',
    access: 'unifiedLedger.view',
    Component: UnifiedLedgerPage,
    Icon: BarChart3,
  },
];

export function FinancialReportsHubPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const allowedTabs = useMemo(
    () => TABS.filter((tab) => can(user, tab.access)),
    [user],
  );

  if (allowedTabs.length === 0) {
    return <Navigate to="/" replace />;
  }

  const requestedTab = searchParams.get('tab');
  const activeTab = allowedTabs.some((tab) => tab.id === requestedTab)
    ? (requestedTab as string)
    : allowedTabs[0].id;

  const handleTabChange = (value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', value);
        return next;
      },
      { replace: true },
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('reports.hubTitle')}
        subtitle={t('reports.hubSubtitle')}
        tone="blue"
      />

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="space-y-5"
      >
        <div className="-mx-1 overflow-x-auto pb-1 print:hidden">
          <TabsList
            variant="line"
            className={cn(
              'mx-1 flex w-max min-w-full justify-start gap-1 rounded-xl border border-border bg-card p-1 shadow-sm',
            )}
          >
            {allowedTabs.map((tab) => {
              const Icon = tab.Icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="gap-1.5 whitespace-nowrap rounded-lg px-3 data-active:bg-primary/10 data-active:text-primary"
                >
                  <Icon className="h-4 w-4" />
                  <span>{t(tab.labelKey)}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {/*
          Mount only the active tab’s page. Otherwise every tab’s useEffect
          runs at once (hidden Radix panes) and 403s from an inactive tab
          look like the wrong screen is “broken” for GM/accountant.
        */}
        {allowedTabs.map((tab) => {
          const Component = tab.Component;
          return (
            <TabsContent key={tab.id} value={tab.id} className="mt-0">
              {activeTab === tab.id ? <Component /> : null}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
