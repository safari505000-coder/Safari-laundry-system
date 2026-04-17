import { useTranslation } from 'react-i18next';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from '@/components/error-boundary';
import { AuthProvider } from '@/contexts/auth-context';
import { AuthLayout } from '@/modules/shared/components/shell/auth-layout';
import { ExecutiveShell } from '@/modules/shared/components/shell/executive-shell';
import { RequireRoles } from '@/modules/shared/components/require-roles';
import { RequireOwnerIsland } from '@/modules/owner/require-owner-island';
import { RequireAuth } from '@/components/require-auth';
import { Toaster } from '@/modules/shared/components/ui/sonner';
import { DashboardPage } from '@/pages/dashboard-page';
import { ExpensesPage } from '@/pages/expenses-page';
import { BankDepositsPage } from '@/pages/bank-deposits-page';
import { CollectDriverCashPage } from '@/pages/collect-driver-cash-page';
import { DepositVerificationPage } from '@/modules/accountant/pages/deposit-verification-page';
import { FinancialsPage } from '@/pages/financials-page';
import { FinancialCycleReportPage } from '@/pages/financial-cycle-report-page';
import { ReportsPage } from '@/pages/reports-page';
import { LoginPage } from '@/pages/login-page';
import { OrdersPage } from '@/pages/orders-page';
import { ShiftsPage } from '@/modules/manager/pages/ShiftsPage';
import { SubscribersPage } from '@/pages/subscribers-page';
import { SubscriptionsPage } from '@/pages/subscriptions-page';
import { PayrollPage } from '@/pages/payroll-page';
import { FixedExpensesPage } from '@/pages/fixed-expenses-page';
import { BranchesPage } from '@/pages/branches-page';
import { CollectionsPage } from '@/modules/call-center/pages/collections-page';
import { CustomersPage } from '@/modules/call-center/pages/customers-page';
import { PosRoute } from '@/pages/pos-route';
import { MyDailySalesPage } from '@/modules/driver/pages/my-daily-sales-page';
import { MyCashCustodyPage } from '@/modules/driver/pages/my-cash-custody-page';
import { DriverFieldExpensesPage } from '@/modules/driver/pages/driver-field-expenses-page';
import { DriverMonitorPage } from '@/pages/driver-monitor-page';
import { ExpenseApprovalPage } from '@/pages/expense-approval-page';
import { LiveMonitorPage } from '@/pages/live-monitor-page';
import { DepositsAuditPage } from '@/modules/accountant/pages/deposits-audit-page';
import { KnetAudit } from '@/modules/accountant/pages/KnetAudit';
import { MyDepositsPage } from '@/modules/driver/pages/my-deposits-page';
import { WhatsappToolsPage } from '@/modules/call-center/pages/whatsapp-tools-page';
import { ManageItems } from '@/modules/owner/pages/ManageItems';
import { OwnerDashboard } from '@/modules/owner/pages/OwnerDashboard';

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
                <Route index element={<DashboardPage />} />
                <Route
                  path="owner-dashboard"
                  element={
                    <RequireOwnerIsland>
                      <OwnerDashboard />
                    </RequireOwnerIsland>
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
                  path="knet-audit"
                  element={
                    <RequireRoles roles={['OWNER', 'ACCOUNTANT']}>
                      <KnetAudit />
                    </RequireRoles>
                  }
                />
                <Route path="branches" element={<BranchesPage />} />
                <Route path="customers" element={<CustomersPage />} />
                <Route path="collections" element={<CollectionsPage />} />
                <Route path="my-deposits" element={<MyDepositsPage />} />
                <Route path="whatsapp-tools" element={<WhatsappToolsPage />} />
                <Route path="my-daily-sales" element={<MyDailySalesPage />} />
                <Route path="my-cash-custody" element={<MyCashCustodyPage />} />
                <Route path="my-field-expenses" element={<DriverFieldExpensesPage />} />
                <Route path="admin/driver-monitoring" element={<DriverMonitorPage />} />
                <Route path="driver-monitor" element={<Navigate to="/admin/driver-monitoring" replace />} />
                <Route path="subscriptions" element={<SubscriptionsPage />} />
                <Route path="subscribers" element={<SubscribersPage />} />
                <Route path="orders" element={<OrdersPage />} />
                <Route path="shifts" element={<ShiftsPage />} />
                <Route path="financials" element={<FinancialsPage />} />
                <Route path="bank-deposits" element={<BankDepositsPage />} />
                <Route path="deposit-verification" element={<DepositVerificationPage />} />
                <Route path="expense-approval" element={<ExpenseApprovalPage />} />
                <Route path="deposits-audit" element={<DepositsAuditPage />} />
                <Route path="collect-driver-cash" element={<CollectDriverCashPage />} />
                <Route path="financial-cycle-report" element={<FinancialCycleReportPage />} />
                <Route path="reports" element={<ReportsPage />} />
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
      </AuthProvider>
    </ErrorBoundary>
  );
}

