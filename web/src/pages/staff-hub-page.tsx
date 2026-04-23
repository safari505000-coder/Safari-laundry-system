import { useCallback, useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/modules/shared/components/ui/tabs';
import { AttendancePage } from '@/pages/attendance-page';
import { CommissionPayoutsPage } from '@/pages/commission-payouts-page';
import { CommissionRulesPage } from '@/pages/commission-rules-page';
import { DebtHoldsPage } from '@/pages/debt-holds-page';
import { PayrollUnifiedPage } from '@/pages/payroll-unified-page';
import { SystemSettingsPage } from '@/pages/system-settings-page';

/**
 * V19.17 — Staff-affairs hub.
 *
 * Dedicated page distinct from `/owner-dashboard` (which stays focused
 * on user accounts + branch registry). This hub groups the operational
 * HR surfaces into a single tabbed shell so the Owner/GM can stay in
 * one page while switching between payroll, attendance, commission,
 * debt-hold and master-settings views.
 *
 * Tab state is reflected in the URL (`?tab=<key>`), enabling
 * bookmarkable deep-links. The "Print" button in the header calls
 * `window.print()` — the global print stylesheet (see `index.css`)
 * pulls `#hr-hub-print-root` to fixed position and whitelists only its
 * subtree, so the printed output matches exactly the currently-open
 * tab's content with hub chrome (title header + tabs) hidden.
 */

type TabKey =
  | 'payroll'
  | 'attendance'
  | 'commission-payouts'
  | 'debt-holds'
  | 'commission-rules'
  | 'settings';

// V19.17 — Payroll is one unified surface: `PayrollUnifiedPage`
// pre-fills each employee row from their salary defaults, lets the
// Owner edit basic / allowances / deductions inline, and saves the
// payroll + updates defaults in one action. Hold release stays in the
// dedicated "debt-holds" tab so create vs. release stay separated.
const TAB_LABEL: Record<TabKey, string> = {
  payroll: 'مسير الرواتب',
  attendance: 'الحضور',
  'commission-payouts': 'كشف العمولة',
  'debt-holds': 'محجوز المديونية',
  'commission-rules': 'قواعد العمولة',
  settings: 'إعدادات النظام',
};

const TAB_ORDER: TabKey[] = [
  'payroll',
  'attendance',
  'commission-payouts',
  'debt-holds',
  'commission-rules',
  'settings',
];

const DEFAULT_TAB: TabKey = 'payroll';

function isTabKey(value: string | null): value is TabKey {
  return !!value && (TAB_ORDER as string[]).includes(value);
}

export function StaffHubPage() {
  const { hasRole } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab: TabKey = useMemo(() => {
    const t = searchParams.get('tab');
    return isTabKey(t) ? t : DEFAULT_TAB;
  }, [searchParams]);

  const setActiveTab = useCallback(
    (next: TabKey) => {
      const params = new URLSearchParams(searchParams);
      if (next === DEFAULT_TAB) {
        params.delete('tab');
      } else {
        params.set('tab', next);
      }
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const handlePrint = useCallback(() => {
    if (typeof window !== 'undefined') window.print();
  }, []);

  // OWNER/GM see everything. ACCOUNTANT + MANAGER reach the hub for
  // commission-payouts / debt-holds / attendance views they're already
  // entitled to via the per-page access matrix; the settings tabs just
  // render their own "insufficient role" state internally.
  if (!hasRole('OWNER', 'GENERAL_MANAGER', 'ACCOUNTANT', 'MANAGER')) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-4 p-4 md:p-6" data-hub-print-hide="false">
      <header
        className="flex flex-wrap items-end justify-between gap-3"
        data-hub-print-hide="true"
      >
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold text-foreground">
            شؤون الموظفين
          </h1>
          <p className="text-sm text-muted-foreground">
            الرواتب، الحضور، العمولة، محجوز المديونية وإعدادات الأنظمة
            المرتبطة — في صفحة واحدة مع طباعة مخصصة للقائمة المفتوحة.
          </p>
        </div>
        <Button onClick={handlePrint} variant="default">
          <Printer className="ms-1 h-4 w-4" />
          طباعة {TAB_LABEL[activeTab]}
        </Button>
      </header>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(String(v) as TabKey)}
      >
        <TabsList
          variant="line"
          className="flex flex-wrap gap-1 overflow-x-auto bg-transparent"
          data-hub-print-hide="true"
        >
          {TAB_ORDER.map((key) => (
            <TabsTrigger key={key} value={key}>
              {TAB_LABEL[key]}
            </TabsTrigger>
          ))}
        </TabsList>

        <div id="hr-hub-print-root" className="mt-4">
          <div className="mb-3 hidden items-baseline justify-between print:flex">
            <div className="text-lg font-bold">{TAB_LABEL[activeTab]}</div>
            <div className="text-xs text-muted-foreground">
              {new Date().toLocaleDateString('en-GB')} —{' '}
              {new Date().toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>

          <TabsContent value="payroll">
            <PayrollUnifiedPage />
          </TabsContent>

          <TabsContent value="attendance">
            <AttendancePage />
          </TabsContent>

          <TabsContent value="commission-payouts">
            <CommissionPayoutsPage />
          </TabsContent>

          <TabsContent value="debt-holds">
            <DebtHoldsPage />
          </TabsContent>

          <TabsContent value="commission-rules">
            <CommissionRulesPage />
          </TabsContent>

          <TabsContent value="settings">
            <SystemSettingsPage />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

export default StaffHubPage;
