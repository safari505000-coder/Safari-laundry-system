import { useCallback, useEffect, useMemo } from 'react';
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
 * bookmarkable deep-links.
 *
 * V19.22 — Print behaviour was restructured. Previously the Print
 * button (and raw Ctrl+P) just fired `window.print()` and let the
 * browser render whatever was in `#hr-hub-print-root`, which meant
 * the payroll tab printed with tight `@media print` hacks and NO
 * digital stamp (QR). Now:
 *   • On the PAYROLL tab, both the Print button and Ctrl+P are
 *     intercepted and route to the dedicated `/payroll/roster/print`
 *     page (A4 landscape, brand header, QR stamp, signature boxes)
 *     with `?ym=<YYYY-MM>` carried over from the unified page.
 *   • On every other tab we still call `window.print()` because
 *     those surfaces have their own in-place print CSS and no
 *     dedicated A4 route yet.
 * That way the Owner always gets a stamped, verifiable document
 * for payroll — whether they click the button or use the keyboard
 * shortcut.
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

  // V19.22 — When the payroll tab is active, redirect every print
  // attempt (button click OR Ctrl+P / Cmd+P) to the dedicated A4
  // landscape roster page so the output always carries the QR
  // stamp. `ym` is read from the URL (the unified page syncs it).
  const openPayrollRosterPrint = useCallback(() => {
    if (typeof window === 'undefined') return;
    const ym = searchParams.get('ym') ?? '';
    const qs = new URLSearchParams();
    if (ym) qs.set('ym', ym);
    window.open(
      `/payroll/roster/print${qs.toString() ? `?${qs.toString()}` : ''}`,
      '_blank',
      'noopener,noreferrer',
    );
  }, [searchParams]);

  const handlePrint = useCallback(() => {
    if (activeTab === 'payroll') {
      openPayrollRosterPrint();
      return;
    }
    if (typeof window !== 'undefined') window.print();
  }, [activeTab, openPayrollRosterPrint]);

  // Intercept Ctrl+P (or Cmd+P on macOS) while on the payroll tab
  // and reroute to the dedicated roster page. We only swallow the
  // event on that tab — other tabs keep native browser print.
  useEffect(() => {
    if (activeTab !== 'payroll') return undefined;
    const onKey = (e: KeyboardEvent) => {
      const isPrintCombo =
        (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === 'p';
      if (!isPrintCombo) return;
      e.preventDefault();
      e.stopPropagation();
      openPayrollRosterPrint();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true });
    };
  }, [activeTab, openPayrollRosterPrint]);

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
          {activeTab === 'payroll'
            ? 'طباعة المسير الرسمي (A4 أفقي + ختم رقمي)'
            : `طباعة ${TAB_LABEL[activeTab]}`}
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
