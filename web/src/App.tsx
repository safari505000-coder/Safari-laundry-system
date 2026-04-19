import { useTranslation } from 'react-i18next';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from '@/components/error-boundary';
import { AuthProvider } from '@/contexts/auth-context';
import { SafariStreamProvider } from '@/contexts/safari-stream-context';
import { AuthLayout } from '@/modules/shared/components/shell/auth-layout';
import { ExecutiveShell } from '@/modules/shared/components/shell/executive-shell';
import { RequireAccess } from '@/modules/shared/components/require-access';
import { RequireOwnerIsland } from '@/modules/owner/require-owner-island';
import { RequireAuth } from '@/components/require-auth';
import { Toaster } from '@/modules/shared/components/ui/sonner';
import { DashboardPage } from '@/pages/dashboard-page';
import { DebtTransfersPage } from '@/pages/debt-transfers-page';
import { MyDebtTransfersPage } from '@/pages/my-debt-transfers-page';
import { AttendancePage } from '@/pages/attendance-page';
import { AttendanceReportPrintPage } from '@/pages/attendance-report-print-page';
import { PayslipPrintPage } from '@/pages/payslip-print-page';
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
 * V19.0 — OWNER and GENERAL_MANAGER (the Owner's Second Eye) land on the
 * Financial Island. All other roles keep the operational dashboard.
 */
function IndexRoute() {
  const { hasRole } = useAuth();
  if (hasRole('OWNER', 'GENERAL_MANAGER')) {
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
              <Route
                path="/pos"
                element={
                  <RequireAccess access="pos.use">
                    <PosRoute />
                  </RequireAccess>
                }
              />
              <Route
                path="/admin/live-monitor"
                element={
                  <RequireAccess access="liveMonitor.view">
                    <LiveMonitorPage />
                  </RequireAccess>
                }
              />
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
                    <RequireAccess access="branches.manage">
                      <BranchesPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="manage-items"
                  element={
                    <RequireAccess access="manageItems.edit">
                      <ManageItems />
                    </RequireAccess>
                  }
                />
                <Route
                  path="knet-audit"
                  element={
                    <RequireAccess access="knetAudit.view">
                      <KnetAudit />
                    </RequireAccess>
                  }
                />
                <Route
                  path="owner/inventory"
                  element={
                    <RequireAccess access="inventoryReport.view">
                      <OwnerInventoryReportPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="accountant/inventory"
                  element={
                    <RequireAccess access="inventoryReport.view">
                      <AccountantInventoryReportPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="accountant/stock-in"
                  element={
                    <RequireAccess access="inventoryReport.stockIn">
                      <AccountantStockInPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="customers"
                  element={
                    <RequireAccess access="customers.view">
                      <CustomersPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="collections"
                  element={
                    <RequireAccess access="collections.view">
                      <CollectionsPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="my-deposits"
                  element={
                    <RequireAccess access="myDeposits.view">
                      <MyDepositsPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="whatsapp-tools"
                  element={
                    <RequireAccess access="whatsappTools.use">
                      <WhatsappToolsPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="my-daily-sales"
                  element={
                    <RequireAccess access="myDailySales.view">
                      <MyDailySalesPage />
                    </RequireAccess>
                  }
                />
                {/* V19.5 — Legacy `my-cash-custody` URL kept as a 301-style
                    redirect so old bookmarks keep working. The canonical
                    driver custody page is `/my-deposits`. */}
                <Route
                  path="my-cash-custody"
                  element={<Navigate to="/my-deposits" replace />}
                />
                <Route
                  path="my-field-expenses"
                  element={
                    <RequireAccess access="myFieldExpenses.view">
                      <DriverFieldExpensesPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="driver/pending-invoices"
                  element={
                    <RequireAccess access="driverPendingInvoices.view">
                      <DriverPendingInvoicesPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="admin/driver-monitoring"
                  element={
                    <RequireAccess access="driverMonitor.view">
                      <DriverMonitorPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="subscriptions"
                  element={
                    <RequireAccess access="subscriptions.view">
                      <SubscriptionsPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="subscribers"
                  element={
                    <RequireAccess access="subscribers.view">
                      <SubscribersPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="orders"
                  element={
                    <RequireAccess access="orders.view">
                      <OrdersPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="shifts"
                  element={
                    <RequireAccess access="shifts.view">
                      <ShiftsPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="manager/custody"
                  element={
                    <RequireAccess access="managerCustody.view">
                      <MyCustodyPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="finance/manager-custody-aging"
                  element={
                    <RequireAccess access="managerCustodyAging.view">
                      <ManagerCustodyAgingPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="staff-debts"
                  element={
                    <RequireAccess access="staffDebts.view">
                      <StaffDebtsPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="owner/serials"
                  element={
                    <RequireAccess access="ownerSerials.manage">
                      <OwnerSerialsPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="owner/debt-recovery"
                  element={
                    <RequireAccess access="debtRecoveryReport.view">
                      <DebtRecoveryReportPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="financials"
                  element={
                    <RequireAccess access="financials.view">
                      <FinancialsPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="finance/debt-transfers"
                  element={
                    <RequireAccess access="debtTransfer.view">
                      <DebtTransfersPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="my/debt-transfers"
                  element={
                    <RequireAccess access="debtTransfer.mine">
                      <MyDebtTransfersPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="attendance"
                  element={
                    <RequireAccess access="attendance.view">
                      <AttendancePage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="attendance/print"
                  element={
                    <RequireAccess access="attendance.view">
                      <AttendanceReportPrintPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="payroll/:id/print"
                  element={<PayslipPrintPage />}
                />
                <Route
                  path="expense-approval"
                  element={
                    <RequireAccess access="expenseApproval.view">
                      <ExpenseApprovalPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="financial-cycle-report"
                  element={
                    <RequireAccess access="financialCycleReport.view">
                      <FinancialCycleReportPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="reports"
                  element={
                    <RequireAccess access="reports.view">
                      <ReportsPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="unified-ledger"
                  element={
                    <RequireAccess access="unifiedLedger.view">
                      <UnifiedLedgerPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="payroll"
                  element={
                    <RequireAccess access="payroll.view">
                      <PayrollPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="fixed-expenses"
                  element={
                    <RequireAccess access="fixedExpenses.view">
                      <FixedExpensesPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="expenses"
                  element={
                    <RequireAccess access="expenses.view">
                      <ExpensesPage />
                    </RequireAccess>
                  }
                />
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
