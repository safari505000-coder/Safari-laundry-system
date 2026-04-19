import { useTranslation } from 'react-i18next';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from '@/components/error-boundary';
import { AuthProvider } from '@/contexts/auth-context';
import { SafariStreamProvider } from '@/contexts/safari-stream-context';
import { AuthLayout } from '@/modules/shared/components/shell/auth-layout';
import { ExecutiveShell } from '@/modules/shared/components/shell/executive-shell';
import { RequireRoles } from '@/modules/shared/components/require-roles';
import { RequireOwnerIsland } from '@/modules/owner/require-owner-island';
import { RequireAuth } from '@/components/require-auth';
import { Toaster } from '@/modules/shared/components/ui/sonner';
import { DashboardPage } from '@/pages/dashboard-page';
import { ExpensesPage } from '@/pages/expenses-page';
import { FinancialsPage } from '@/pages/financials-page';
import { FinancialCycleReportPage } from '@/pages/financial-cycle-report-page';
import { ReportsPage } from '@/pages/reports-page';
import { LoginPage } from '@/pages/login-page';
import { OrdersPage } from '@/pages/orders-page';
import { MyCustodyPage } from '@/modules/manager/pages/MyCustodyPage';
import { ShiftsPage } from '@/modules/manager/pages/ShiftsPage';
import { SubscribersPage } from '@/pages/subscribers-page';
import { SubscriptionsPage } from '@/pages/subscriptions-page';
import { PayrollPage } from '@/pages/payroll-page';
import { FixedExpensesPage } from '@/pages/fixed-expenses-page';
import { CollectionsPage } from '@/modules/call-center/pages/collections-page';
import { CustomersPage } from '@/modules/call-center/pages/customers-page';
import { PosRoute } from '@/pages/pos-route';
import { MyDailySalesPage } from '@/modules/driver/pages/my-daily-sales-page';
import { MyCashCustodyPage } from '@/modules/driver/pages/my-cash-custody-page';
import { DriverFieldExpensesPage } from '@/modules/driver/pages/driver-field-expenses-page';
import { DriverPendingInvoicesPage } from '@/modules/driver/pages/driver-pending-invoices-page';
import { DriverMonitorPage } from '@/pages/driver-monitor-page';
import { ExpenseApprovalPage } from '@/pages/expense-approval-page';
import { LiveMonitorPage } from '@/pages/live-monitor-page';
import { KnetAudit } from '@/modules/accountant/pages/KnetAudit';
import AccountantInventoryReportPage from '@/modules/accountant/pages/InventoryReport';
import AccountantStockInPage from '@/modules/accountant/pages/StockIn';
import { UnifiedLedgerPage } from '@/pages/unified-ledger-page';
import { MyDepositsPage } from '@/modules/driver/pages/my-deposits-page';
import { WhatsappToolsPage } from '@/modules/call-center/pages/whatsapp-tools-page';
import { ManageItems } from '@/modules/owner/pages/ManageItems';
import { OwnerDashboard } from '@/modules/owner/pages/OwnerDashboard';
import OwnerInventoryReportPage from '@/modules/owner/pages/InventoryReport';
import { ManagerCustodyAgingPage } from '@/pages/manager-custody-aging-page';
import { StaffDebtsPage } from '@/pages/staff-debts-page';
import { DebtRecoveryReportPage } from '@/pages/debt-recovery-report-page';
import { OwnerSerialsPage } from '@/pages/owner-serials-page';
import { BranchesPage } from '@/pages/branches-page';
import { useAuth } from '@/contexts/auth-context';

/**
 * V18.0 — OWNER's landing page is the Financial Island. All other roles keep
 * the operational dashboard as the index route.
 */
function IndexRoute() {
  const { hasRole } = useAuth();
  if (hasRole('OWNER')) {
    return <Navigate to="/financials" replace />;
  }
  return <DashboardPage />;
}

function AppToaster() {
  const { i18n } = useTranslation();
  const rtl = i18n.language.startsWith('ar');
  return (
    <Toaster richColors position={rtl ? 'top-left' : 'top-right'} />
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <SafariStreamProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <RequireAuth>
                  <AuthLayout />
                </RequireAuth>
              }
            >
              <Route path="/pos" element={<PosRoute />} />
              <Route path="/admin/live-monitor" element={<LiveMonitorPage />} />
              <Route path="/" element={<ExecutiveShell />}>
                <Route index element={<IndexRoute />} />
                <Route
                  path="owner-dashboard"
                  element={
                    <RequireOwnerIsland>
                      <OwnerDashboard />
                    </RequireOwnerIsland>
                  }
                />
                <Route
                  path="branches"
                  element={
                    <RequireRoles roles={['OWNER']}>
                      <BranchesPage />
                    </RequireRoles>
                  }
                />
                <Route
                  path="manage-items"
                  element={
                    <RequireRoles roles={['OWNER']}>
                      <ManageItems />
                    </RequireRoles>
                  }
                />
                <Route
                  path="owner-profit-radar"
                  element={<Navigate to="/financials" replace />}
                />
                <Route
                  path="knet-audit"
                  element={
                    <RequireRoles roles={['OWNER', 'ACCOUNTANT']}>
                      <KnetAudit />
                    </RequireRoles>
                  }
                />
                <Route
                  path="owner/inventory"
                  element={
                    <RequireRoles roles={['OWNER']}>
                      <OwnerInventoryReportPage />
                    </RequireRoles>
                  }
                />
                <Route
                  path="accountant/inventory"
                  element={
                    <RequireRoles roles={['OWNER', 'ACCOUNTANT']}>
                      <AccountantInventoryReportPage />
                    </RequireRoles>
                  }
                />
                <Route
                  path="accountant/stock-in"
                  element={
                    <RequireRoles roles={['ACCOUNTANT']}>
                      <AccountantStockInPage />
                    </RequireRoles>
                  }
                />
                <Route
                  path="customers"
                  element={
                    <RequireRoles roles={['OWNER', 'CALL_CENTER']}>
                      <CustomersPage />
                    </RequireRoles>
                  }
                />
                <Route
                  path="collections"
                  element={
                    <RequireRoles roles={['OWNER', 'CALL_CENTER']}>
                      <CollectionsPage />
                    </RequireRoles>
                  }
                />
                <Route path="my-deposits" element={<MyDepositsPage />} />
                <Route
                  path="whatsapp-tools"
                  element={
                    <RequireRoles roles={['OWNER', 'ACCOUNTANT']}>
                      <WhatsappToolsPage />
                    </RequireRoles>
                  }
                />
                <Route path="my-daily-sales" element={<MyDailySalesPage />} />
                <Route path="my-cash-custody" element={<MyCashCustodyPage />} />
                <Route path="my-field-expenses" element={<DriverFieldExpensesPage />} />
                {/* V3.8 — Driver-only Field Collection Tracker (read-only
                    unpaid invoices). DRIVER role is enforced inside the
                    page via `hasRole('DRIVER')`; we also gate the route
                    here for defence-in-depth. */}
                <Route
                  path="driver/pending-invoices"
                  element={
                    <RequireRoles roles={['DRIVER']}>
                      <DriverPendingInvoicesPage />
                    </RequireRoles>
                  }
                />
                <Route path="admin/driver-monitoring" element={<DriverMonitorPage />} />
                <Route path="driver-monitor" element={<Navigate to="/admin/driver-monitoring" replace />} />
                <Route path="subscriptions" element={<SubscriptionsPage />} />
                <Route path="subscribers" element={<SubscribersPage />} />
                <Route path="orders" element={<OrdersPage />} />
                <Route path="shifts" element={<ShiftsPage />} />
                <Route
                  path="manager/custody"
                  element={
                    <RequireRoles roles={['MANAGER']}>
                      <MyCustodyPage />
                    </RequireRoles>
                  }
                />
                <Route
                  path="finance/manager-custody-aging"
                  element={
                    <RequireRoles roles={['OWNER', 'ACCOUNTANT']}>
                      <ManagerCustodyAgingPage />
                    </RequireRoles>
                  }
                />
                <Route
                  path="staff-debts"
                  element={
                    <RequireRoles roles={['OWNER', 'ACCOUNTANT']}>
                      <StaffDebtsPage />
                    </RequireRoles>
                  }
                />
                <Route
                  path="owner/serials"
                  element={
                    <RequireRoles roles={['OWNER']}>
                      <OwnerSerialsPage />
                    </RequireRoles>
                  }
                />
                <Route
                  path="owner/debt-recovery"
                  element={
                    <RequireRoles roles={['OWNER']}>
                      <DebtRecoveryReportPage />
                    </RequireRoles>
                  }
                />
                <Route
                  path="financials"
                  element={
                    <RequireRoles roles={['OWNER']}>
                      <FinancialsPage />
                    </RequireRoles>
                  }
                />
                <Route path="expense-approval" element={<ExpenseApprovalPage />} />
                <Route path="financial-cycle-report" element={<FinancialCycleReportPage />} />
                <Route
                  path="reports"
                  element={
                    <RequireRoles roles={['OWNER', 'ACCOUNTANT']}>
                      <ReportsPage />
                    </RequireRoles>
                  }
                />
                <Route
                  path="unified-ledger"
                  element={
                    <RequireRoles roles={['OWNER', 'ACCOUNTANT']}>
                      <UnifiedLedgerPage />
                    </RequireRoles>
                  }
                />
                <Route path="payroll" element={<PayrollPage />} />
                <Route path="fixed-expenses" element={<FixedExpensesPage />} />
                <Route path="expenses" element={<ExpensesPage />} />
                <Route path="users-management" element={<Navigate to="/owner-dashboard" replace />} />
                <Route path="team" element={<Navigate to="/owner-dashboard" replace />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <AppToaster />
        </SafariStreamProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

