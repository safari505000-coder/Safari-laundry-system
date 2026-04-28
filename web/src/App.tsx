import { useTranslation } from 'react-i18next';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from '@/components/error-boundary';
import { OfflineGlobalAlerts } from '@/offline/offline-global-alerts';
import { OfflineSyncProvider } from '@/offline/offline-sync-context';
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
import { PayrollRosterPrintPage } from '@/pages/payroll-roster-print-page';
import { LeavesPage } from '@/pages/leaves-page';
import { LeaveRequestPrintPage } from '@/pages/leave-request-print-page';
import { LoansPage } from '@/pages/loans-page';
import { LoanPrintPage } from '@/pages/loan-print-page';
import { InvoicePrintPage } from '@/pages/invoice-print-page';
import { StatementPrintPage } from '@/pages/statement-print-page';
import { PublicStatementPage } from '@/pages/public-statement-page';
import { PublicInvoicePage } from '@/pages/public-invoice-page';
import { FeedbackPublicPage } from '@/pages/feedback-public-page';
import { FeedbackInboxPage } from '@/pages/feedback-inbox-page';
import {
  PaymentFailedPage,
  PaymentSuccessPage,
} from '@/pages/payment-result-page';
import { ExpensesPage } from '@/pages/expenses-page';
import { FinancialsPage } from '@/pages/financials-page';
import { MonthlySummaryPage } from '@/pages/monthly-summary-page';
import { MonthlySummaryPrintPage } from '@/pages/monthly-summary-print-page';
import { MonthlyReportFullPrintPage } from '@/pages/monthly-report-full-print-page';
import { MoneyFlowStatementPage } from '@/pages/money-flow-statement-page';
import { InsightsAiPage } from '@/pages/insights-ai-page';
import { FinancialCycleReportPage } from '@/pages/financial-cycle-report-page';
import { DriverCashTracePage } from '@/pages/driver-cash-trace-page';
import { UnpaidInvoicesPage } from '@/pages/unpaid-invoices-page';
import { ReportsPage } from '@/pages/reports-page';
import { FinancialReportsHubPage } from '@/pages/financial-reports-hub-page';
import { OperationalReportsHubPage } from '@/pages/operational-reports-hub-page';
import { LoginPage } from '@/pages/login-page';
import { OrdersPage } from '@/pages/orders-page';
import { MyCustodyPage } from '@/modules/manager/pages/MyCustodyPage';
import { MyDocumentsPage } from '@/modules/manager/pages/MyDocumentsPage';
import { ExpenseVoucherPrintPage } from '@/modules/manager/pages/ExpenseVoucherPrintPage';
import { DriverOversightPage } from '@/modules/manager/pages/DriverOversightPage';
import { ShiftsPage } from '@/modules/manager/pages/ShiftsPage';
import { SubscribersPage } from '@/pages/subscribers-page';
import { SubscriptionsPage } from '@/pages/subscriptions-page';
import { PayrollPage } from '@/pages/payroll-page';
import { SystemSettingsPage } from '@/pages/system-settings-page';
import { CommissionRulesPage } from '@/pages/commission-rules-page';
import { CommissionPayoutsPage } from '@/pages/commission-payouts-page';
import { DebtHoldsPage } from '@/pages/debt-holds-page';
import { StaffHubPage } from '@/pages/staff-hub-page';
import { FixedExpensesPage } from '@/pages/fixed-expenses-page';
import { CollectionsPage } from '@/modules/call-center/pages/collections-page';
import { CustomersPage } from '@/modules/call-center/pages/customers-page';
import { CallIncomingPage } from '@/pages/call-incoming-page';
import { PosRoute } from '@/pages/pos-route';
import { MyDailySalesPage } from '@/modules/driver/pages/my-daily-sales-page';
import { DriverFieldExpensesPage } from '@/modules/driver/pages/driver-field-expenses-page';
import { DriverPendingInvoicesPage } from '@/modules/driver/pages/driver-pending-invoices-page';
import { DriverMonitorPage } from '@/pages/driver-monitor-page';
import { ExpenseApprovalPage } from '@/pages/expense-approval-page';
import { VehicleExpensesMinePage } from '@/pages/vehicle-expenses-mine-page';
import { VehicleExpensesApprovalPage } from '@/pages/vehicle-expenses-approval-page';
import { VehicleExpensesReportPage } from '@/pages/vehicle-expenses-report-page';
import { LiveMonitorPage } from '@/pages/live-monitor-page';
import { KnetAudit } from '@/modules/accountant/pages/KnetAudit';
import AccountantInventoryReportPage from '@/modules/accountant/pages/InventoryReport';
import AccountantStockInPage from '@/modules/accountant/pages/StockIn';
import InventoryCatalogPage from '@/pages/inventory-catalog-page';
import InventoryOperationsPage from '@/pages/inventory-operations-page';
import InventoryMovementsPage from '@/pages/inventory-movements-page';
import InventoryLowStockPage from '@/pages/inventory-low-stock-page';
import PurchaseOrdersPage from '@/pages/purchase-orders-page';
import { UnifiedLedgerPage } from '@/pages/unified-ledger-page';
import { CcPerformancePage } from '@/pages/cc-performance-page';
import { InvoiceAuditLogPage } from '@/pages/invoice-audit-log-page';
import { AllInvoicesPage } from '@/pages/all-invoices-page';
import { MyDepositsPage } from '@/modules/driver/pages/my-deposits-page';
import { MyCashReceiptsPage } from '@/modules/driver/pages/my-cash-receipts-page';
import { CashReceiptPrintPage } from '@/pages/cash-receipt-print-page';
import { WhatsappToolsPage } from '@/modules/call-center/pages/whatsapp-tools-page';
import { ManageItems } from '@/modules/owner/pages/ManageItems';
import { OwnerDashboard } from '@/modules/owner/pages/OwnerDashboard';
import OwnerInventoryReportPage from '@/modules/owner/pages/InventoryReport';
import { ManagerCustodyAgingPage } from '@/pages/manager-custody-aging-page';
import { StaffDebtsPage } from '@/pages/staff-debts-page';
import { DebtRecoveryReportPage } from '@/pages/debt-recovery-report-page';
import { OwnerSerialsPage } from '@/pages/owner-serials-page';
import { BranchesPage } from '@/pages/branches-page';
/**
 * V19.0 — OWNER and GENERAL_MANAGER (the Owner's Second Eye) land on the
 * Financial Island. All other roles keep the operational dashboard.
 */
function IndexRoute() {
  // V19.9.7 — OWNER / GM now land on the interactive executive
  // dashboard (cash-flow / money movement / debts / net profit) that
  // DashboardPage renders for them. The old redirect to /financials
  // is removed so the dashboard entry point is real work, not a
  // pass-through.
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
        <OfflineSyncProvider>
        <SafariStreamProvider>
        <BrowserRouter>
          <OfflineGlobalAlerts />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            {/*
              V19.8.9 — Public customer statement view.
              Rendered for a link the Call Center sends over WhatsApp.
              The `:token` is a short-lived JWT that embeds the customer
              id; the backend re-scopes every request to that customer so
              no login is required here by design. This route MUST stay
              outside any auth gate.
            */}
            <Route
              path="/public/statement/:token"
              element={<PublicStatementPage />}
            />
            {/*
              V19.24 — Public POS invoice (JWT). Opened from WhatsApp;
              customer saves PDF via the print dialog. No auth.
            */}
            <Route
              path="/public/invoice/:token"
              element={<PublicInvoicePage />}
            />
            {/*
              V19.22 — Public customer rating page. The invoice QR
              encodes `<origin>/r/:orderId` and the customer scans it
              straight from the paper receipt. No auth by design, same
              security pattern as the public statement route above —
              the backend returns a trimmed payload that matches what
              the customer already sees on paper, nothing more.
            */}
            <Route
              path="/r/:orderId"
              element={<FeedbackPublicPage />}
            />
            {/*
              V1.7.0 — Customer return pages for UPayments hosted
              checkout. `returnUrl` (success) and `cancelUrl`
              (failure) configured in payments.service.ts send the
              shopper's browser back to these public routes; each
              page polls the public status endpoint every 3s and
              flips to "paid" as soon as the server-side webhook
              has finalized the order. Public on purpose — the
              customer must be able to see the result on their
              phone without logging into the ERP.
            */}
            <Route path="/payment/success" element={<PaymentSuccessPage />} />
            <Route path="/payment/failed" element={<PaymentFailedPage />} />
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
              {/* V19.8.7 — printable customer statement (كشف حساب)
                  renders as a full-screen island (no ExecutiveShell).
                  The shell's <main> wrapper uses overflow-y-auto which
                  traps the A4 sheet into a scrollable viewport at
                  print time and the browser emits 15+ blank pages.
                  Keeping this route at AuthLayout level bypasses the
                  sidebar + header + overflow stack entirely. */}
              <Route
                path="/customers/:customerId/statement/print"
                element={
                  <RequireAccess access="subscribers.view">
                    <StatementPrintPage />
                  </RequireAccess>
                }
              />
              {/* V19.13.1 — Monthly summary printable sheet. Mounted
                  at AuthLayout level for the same reason as the
                  customer statement print page: the shell's
                  overflow-y-auto wrapper breaks browser print. */}
              <Route
                path="/monthly-summary/print"
                element={
                  <RequireAccess access="monthlySummary.view">
                    <MonthlySummaryPrintPage />
                  </RequireAccess>
                }
              />
              <Route
                path="/monthly-summary/full-print"
                element={
                  <RequireAccess access="monthlySummary.view">
                    <MonthlyReportFullPrintPage />
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
                  path="staff-hub"
                  element={
                    <RequireAccess access="attendance.view">
                      <StaffHubPage />
                    </RequireAccess>
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
                  path="inventory/catalog"
                  element={
                    <RequireAccess access="inventory.catalog.view">
                      <InventoryCatalogPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="inventory/operations"
                  element={
                    <RequireAccess access="inventory.stockOut">
                      <InventoryOperationsPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="inventory/movements"
                  element={
                    <RequireAccess access="inventory.movements.view">
                      <InventoryMovementsPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="inventory/low-stock"
                  element={
                    <RequireAccess access="inventory.lowStock.view">
                      <InventoryLowStockPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="purchase-orders"
                  element={
                    <RequireAccess access="purchaseOrders.view">
                      <PurchaseOrdersPage />
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
                  path="call-incoming"
                  element={
                    <RequireAccess access="customers.view">
                      <CallIncomingPage />
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
                {/* V19.17 — Driver "سندات الاستلام" inbox + per-row
                    printable voucher. The print route is opened in a
                    new tab from both the driver inbox and any admin
                    custody view; RBAC on the backend enforces who
                    can actually fetch each row. */}
                <Route
                  path="my-cash-receipts"
                  element={
                    <RequireAccess access="myCashReceipts.view">
                      <MyCashReceiptsPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="my-cash-receipts/:id/print"
                  element={
                    <RequireAccess access="myCashReceipts.view">
                      <CashReceiptPrintPage />
                    </RequireAccess>
                  }
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
                {/* V19.7.5 — printable POS invoice ("صورة الفاتورة")
                    opened from the Customer 360 ledger panel. Gated
                    by orders.view so it inherits the same RBAC as
                    the Orders page: DRIVER/CALL_CENTER/OWNER/GM/
                    MANAGER/ACCOUNTANT/SUPERVISOR/VIEWER. The backend
                    endpoint `/api/orders/:id` applies an additional
                    driver-self-only check, so a driver cannot print
                    another driver's invoice even via this route. */}
                <Route
                  path="invoices/:orderId/print"
                  element={
                    <RequireAccess access="orders.view">
                      <InvoicePrintPage />
                    </RequireAccess>
                  }
                />
                {/* V19.9 — "كل الفواتير" unified browser with phone
                    search, issuer, branch, status, printable image,
                    and supervisor edit/void actions. Shared by CC,
                    CC supervisor, accountant, OWNER, and GM. */}
                <Route
                  path="invoices"
                  element={
                    <RequireAccess access="invoices.browseAll">
                      <AllInvoicesPage />
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
                  path="manager/my-documents"
                  element={
                    <RequireAccess access="managerDocuments.view">
                      <MyDocumentsPage />
                    </RequireAccess>
                  }
                />
                {/*
                  V19.22 — Customer Ratings inbox. Sidebar surface for
                  Owner / GM / Call-Center (agent + supervisor) to read
                  QR-submitted star ratings + notes and mark them as
                  addressed. Access matrix gates the route and the nav
                  entry together.
                */}
                <Route
                  path="feedback"
                  element={
                    <RequireAccess access="feedback.view">
                      <FeedbackInboxPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="my-documents/expense/:id/print"
                  element={
                    <RequireAccess access="managerDocuments.view">
                      <ExpenseVoucherPrintPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="manager/driver-oversight"
                  element={
                    <RequireAccess access="driverOversight.view">
                      <DriverOversightPage />
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
                  path="monthly-summary"
                  element={
                    <RequireAccess access="monthlySummary.view">
                      <MonthlySummaryPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="money-flow-statement"
                  element={
                    <RequireAccess access="moneyFlowStatement.view">
                      <MoneyFlowStatementPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="insights/ai"
                  element={
                    <RequireAccess access="insights.view">
                      <InsightsAiPage />
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
                {/*
                  V19.21 — Monthly payroll roster (مسير الرواتب الشهري).
                  Opens in a new tab from the unified payroll page and
                  auto-prints once data loads. Reuses the same payroll
                  read guard — only roles that can view the unified
                  page should be able to print its roster.
                */}
                <Route
                  path="payroll/roster/print"
                  element={
                    <RequireAccess access="payroll.view">
                      <PayrollRosterPrintPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="leaves"
                  element={
                    <RequireAccess access="hr.leaves.mine">
                      <LeavesPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="leaves/:id/print"
                  element={
                    <RequireAccess access="hr.leaves.mine">
                      <LeaveRequestPrintPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="loans"
                  element={
                    <RequireAccess access="hr.loans.mine">
                      <LoansPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="loans/:id/print"
                  element={
                    <RequireAccess access="hr.loans.mine">
                      <LoanPrintPage />
                    </RequireAccess>
                  }
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
                  path="vehicle-expenses"
                  element={
                    <RequireAccess access="vehicleExpenses.mine">
                      <VehicleExpensesMinePage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="vehicle-expenses/approval"
                  element={
                    <RequireAccess access="vehicleExpenses.approval.view">
                      <VehicleExpensesApprovalPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="vehicle-expenses/report"
                  element={
                    <RequireAccess access="vehicleExpenses.report.view">
                      <VehicleExpensesReportPage />
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
                  path="driver-cash-trace"
                  element={
                    <RequireAccess access="driverCashTrace.view">
                      <DriverCashTracePage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="unpaid-invoices"
                  element={
                    <RequireAccess access="unpaidInvoices.view">
                      <UnpaidInvoicesPage />
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
                  path="reports-hub"
                  element={
                    <RequireAccess access="reports.view">
                      <FinancialReportsHubPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="operational-reports-hub"
                  element={
                    <RequireAccess access="operationalReportsHub.view">
                      <OperationalReportsHubPage />
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
                  path="settings/dashboard"
                  element={
                    <RequireAccess access="settings.dashboard.view">
                      <SystemSettingsPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="settings/commission-rules"
                  element={
                    <RequireAccess access="settings.commissionRules.manage">
                      <CommissionRulesPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="commission-payouts"
                  element={
                    <RequireAccess access="commissionPayouts.view">
                      <CommissionPayoutsPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="debt-holds"
                  element={
                    <RequireAccess access="debtHolds.view">
                      <DebtHoldsPage />
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
                <Route
                  path="cc-performance"
                  element={
                    <RequireAccess access="ccPerformance.view">
                      <CcPerformancePage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="invoice-audit"
                  element={
                    <RequireAccess access="invoiceAudit.view">
                      <InvoiceAuditLogPage />
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
        </OfflineSyncProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
