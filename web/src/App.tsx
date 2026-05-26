import { Suspense, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from '@/components/error-boundary';
import { lazyPage, RouteSuspenseFallback } from '@/modules/shared/lazy';
import { OfflineGlobalAlerts } from '@/offline/offline-global-alerts';
import { OfflineSyncProvider } from '@/offline/offline-sync-context';
import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { SafariStreamProvider } from '@/contexts/safari-stream-context';
import { AuthLayout } from '@/modules/shared/components/shell/auth-layout';
import { ExecutiveShell } from '@/modules/shared/components/shell/executive-shell';
import { RequireAccess } from '@/modules/shared/components/require-access';
import { can } from '@/modules/shared/auth/access-matrix';
import { RequireAuth } from '@/components/require-auth';
import { Toaster } from '@/modules/shared/components/ui/sonner';
import { ExecutiveDashboardPage } from '@/pages/executive-dashboard-page';
import { DebtTransfersPage } from '@/pages/debt-transfers-page';
import { MyDebtTransfersPage } from '@/pages/my-debt-transfers-page';
import { AttendancePage } from '@/pages/attendance-page';
const AttendanceReportPrintPage = lazyPage(
  () => import('@/pages/attendance-report-print-page'),
  'AttendanceReportPrintPage',
);
const PayslipPrintPage = lazyPage(
  () => import('@/pages/payslip-print-page'),
  'PayslipPrintPage',
);
const PayrollRosterPrintPage = lazyPage(
  () => import('@/pages/payroll-roster-print-page'),
  'PayrollRosterPrintPage',
);
import { LeavesPage } from '@/pages/leaves-page';
const LeaveRequestPrintPage = lazyPage(
  () => import('@/pages/leave-request-print-page'),
  'LeaveRequestPrintPage',
);
import { LoansPage } from '@/pages/loans-page';
const LoanPrintPage = lazyPage(
  () => import('@/pages/loan-print-page'),
  'LoanPrintPage',
);
const InvoicePrintPage = lazyPage(
  () => import('@/pages/invoice-print-page'),
  'InvoicePrintPage',
);
const StatementPrintPage = lazyPage(
  () => import('@/pages/statement-print-page'),
  'StatementPrintPage',
);
import { PublicStatementPage } from '@/pages/public-statement-page';
import { PublicInvoicePage } from '@/pages/public-invoice-page';
import { FeedbackPublicPage } from '@/pages/feedback-public-page';
import { FeedbackInboxPage } from '@/pages/feedback-inbox-page';
import { WebsiteOrderRequestsPage } from '@/modules/call-center/pages/website-order-requests-page';
import { ForbiddenPage } from '@/pages/forbidden-page';
import {
  PaymentFailedPage,
  PaymentSuccessPage,
} from '@/pages/payment-result-page';
import { ExpensesPage } from '@/pages/expenses-page';
import { FinancialsPage } from '@/pages/financials-page';
import { MonthlySummaryPage } from '@/pages/monthly-summary-page';
const MonthlySummaryPrintPage = lazyPage(
  () => import('@/pages/monthly-summary-print-page'),
  'MonthlySummaryPrintPage',
);
const MonthlyReportFullPrintPage = lazyPage(
  () => import('@/pages/monthly-report-full-print-page'),
  'MonthlyReportFullPrintPage',
);
const MoneyFlowStatementPage = lazyPage(
  () => import('@/pages/money-flow-statement-page'),
  'MoneyFlowStatementPage',
);
const InsightsAiPage = lazyPage(
  () => import('@/pages/insights-ai-page'),
  'InsightsAiPage',
);
const FinancialCycleReportPage = lazyPage(
  () => import('@/pages/financial-cycle-report-page'),
  'FinancialCycleReportPage',
);
const DriverCashTracePage = lazyPage(
  () => import('@/pages/driver-cash-trace-page'),
  'DriverCashTracePage',
);
const CashReconciliationPage = lazyPage(
  () => import('@/pages/cash-reconciliation-page'),
  'CashReconciliationPage',
);
import { AccountantDashboardPage } from '@/pages/accountant-dashboard-page';
const UnpaidInvoicesPage = lazyPage(
  () => import('@/pages/unpaid-invoices-page'),
  'UnpaidInvoicesPage',
);
import { CustomerStatementJournalPage } from '@/pages/customer-statement-journal-page';
import { AccountantDoubleEntryJournalPage } from '@/pages/accountant-double-entry-journal-page';
const ReportsPage = lazyPage(
  () => import('@/pages/reports-page'),
  'ReportsPage',
);
const SalesSummaryReportPage = lazyPage(
  () => import('@/pages/sales-summary-report-page'),
  'SalesSummaryReportPage',
);
const FinancialReportsHubPage = lazyPage(
  () => import('@/pages/financial-reports-hub-page'),
  'FinancialReportsHubPage',
);
const OperationalReportsHubPage = lazyPage(
  () => import('@/pages/operational-reports-hub-page'),
  'OperationalReportsHubPage',
);
import { LoginPage } from '@/pages/login-page';
import { ForceChangePasswordPage } from '@/pages/force-change-password';
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
const CollectionsCenterPage = lazyPage(
  () => import('@/modules/call-center/pages/collections-center-page'),
  'CollectionsCenterPage',
);
import { CustomersPage } from '@/modules/call-center/pages/customers-page';
import { CcDashboardPage } from '@/modules/call-center/dashboard/pages/cc-dashboard-page';
import { CcCustomer360Page } from '@/modules/call-center/dashboard/pages/cc-customer-360-page';
import { CcCustomer360V2Page } from '@/modules/call-center/dashboard/pages/cc-customer-360-v2-page';
import { ControlTowerPage } from '@/modules/call-center/control-tower/pages/control-tower-page';
import { CustomerPortal360Page } from '@/pages/customer-portal-360-page';
import { CallIncomingPage } from '@/pages/call-incoming-page';
import { PosRoute } from '@/pages/pos-route';
import { DriverTasksPage } from '@/modules/driver/tasks/pages/driver-tasks-page';
import { MyDailySalesPage } from '@/modules/driver/pages/my-daily-sales-page';
import { DriverFieldExpensesPage } from '@/modules/driver/pages/driver-field-expenses-page';
import { DriverPendingInvoicesPage } from '@/modules/driver/pages/driver-pending-invoices-page';
import { DriverMonitorPage } from '@/pages/driver-monitor-page';
import { ExpenseApprovalPage } from '@/pages/expense-approval-page';
import { LiveMonitorPage } from '@/pages/live-monitor-page';
const KnetAudit = lazyPage(
  () => import('@/modules/accountant/pages/KnetAudit'),
  'KnetAudit',
);
const AccountantInventoryReportPage = lazyPage(
  () => import('@/modules/accountant/pages/InventoryReport'),
);
const AccountantStockInPage = lazyPage(
  () => import('@/modules/accountant/pages/StockIn'),
);
const InventoryCatalogPage = lazyPage(
  () => import('@/pages/inventory-catalog-page'),
);
const InventoryOperationsPage = lazyPage(
  () => import('@/pages/inventory-operations-page'),
);
const InventoryMovementsPage = lazyPage(
  () => import('@/pages/inventory-movements-page'),
);
const InventoryLowStockPage = lazyPage(
  () => import('@/pages/inventory-low-stock-page'),
);
const PurchaseOrdersPage = lazyPage(
  () => import('@/pages/purchase-orders-page'),
);
const UnifiedLedgerPage = lazyPage(
  () => import('@/pages/unified-ledger-page'),
  'UnifiedLedgerPage',
);
const FinanceLedgerReportsPage = lazyPage(
  () => import('@/pages/finance-ledger-reports-page'),
  'FinanceLedgerReportsPage',
);
const LedgerBankStatementPage = lazyPage(
  () => import('@/pages/ledger-bank-statement-page'),
);
import { CcPerformancePage } from '@/pages/cc-performance-page';
const InvoiceAuditLogPage = lazyPage(
  () => import('@/pages/invoice-audit-log-page'),
  'InvoiceAuditLogPage',
);
const AllInvoicesPage = lazyPage(
  () => import('@/pages/all-invoices-page'),
  'AllInvoicesPage',
);
import { MyDepositsPage } from '@/modules/driver/pages/my-deposits-page';
import { MyCashReceiptsPage } from '@/modules/driver/pages/my-cash-receipts-page';
const CashReceiptPrintPage = lazyPage(
  () => import('@/pages/cash-receipt-print-page'),
  'CashReceiptPrintPage',
);
import { WhatsappToolsPage } from '@/modules/call-center/pages/whatsapp-tools-page';
const ManageItems = lazyPage(
  () => import('@/modules/owner/pages/ManageItems'),
  'ManageItems',
);
const OwnerDashboard = lazyPage(
  () => import('@/modules/owner/pages/OwnerDashboard'),
  'OwnerDashboard',
);
const AuditLogsPage = lazyPage(
  () => import('@/pages/audit-logs-page'),
  'AuditLogsPage',
);
const OwnerInventoryReportPage = lazyPage(
  () => import('@/modules/owner/pages/InventoryReport'),
);
const ManagerCustodyAgingPage = lazyPage(
  () => import('@/pages/manager-custody-aging-page'),
  'ManagerCustodyAgingPage',
);
const StaffDebtsPage = lazyPage(
  () => import('@/pages/staff-debts-page'),
  'StaffDebtsPage',
);
const DebtRecoveryReportPage = lazyPage(
  () => import('@/pages/debt-recovery-report-page'),
  'DebtRecoveryReportPage',
);
const OwnerSerialsPage = lazyPage(
  () => import('@/pages/owner-serials-page'),
  'OwnerSerialsPage',
);
const BranchesPage = lazyPage(
  () => import('@/pages/branches-page'),
  'BranchesPage',
);
/**
 * Unified-dashboard era:
 *   - OWNER / GENERAL_MANAGER / MANAGER / ACCOUNTANT land on
 *     `/dashboard` — the single cash-intelligence-backed Executive
 *     Dashboard. The backend clamps `branchId` for MANAGER, so the
 *     same component renders the right scope for each role.
 *   - DRIVER goes straight to POS (their working surface).
 *   - CALL_CENTER agents go to the inbound call screen.
 *   - CALL_CENTER_SUPERVISOR lands on the CC performance hub.
 *   - CUSTOMER keeps the self-service portal.
 */
function IndexRoute() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  switch (user.safariRole) {
    case 'CUSTOMER':
      return <Navigate to="/my-customer-360" replace />;
    case 'DRIVER':
      return <Navigate to="/pos" replace />;
    case 'CALL_CENTER':
      // V19.x — CC agents land on the new Customer 360 Dashboard.
      // The legacy `/call-incoming` PBX handoff still works via deep-link
      // (PBX integrations may post URLs at it directly), but the search-
      // first dashboard is the new home base for every shift.
      return <Navigate to="/cc/dashboard" replace />;
    case 'CALL_CENTER_SUPERVISOR':
      return <Navigate to="/cc-performance" replace />;
    default:
      return <Navigate to="/dashboard" replace />;
  }
}

function AppToaster() {
  const { i18n } = useTranslation();
  const rtl = i18n.language.startsWith('ar');
  return (
    <Toaster richColors position={rtl ? 'top-left' : 'top-right'} />
  );
}

function RequireOwnerOrGeneralManager({ children }: { children: ReactNode }) {
  const { user, hasRole } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!hasRole('OWNER', 'GENERAL_MANAGER')) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RequireRole({
  role,
  children,
}: {
  role: Parameters<ReturnType<typeof useAuth>['hasRole']>[0];
  children: ReactNode;
}) {
  const { user, hasRole } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!hasRole(role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/**
 * `/collections` — capability-based default tab on the unified hub.
 */
function CollectionsDefaultRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (can(user, 'collections.view')) {
    return <Navigate to="/collections/center?tab=work" replace />;
  }
  if (can(user, 'outstanding.view')) {
    return <Navigate to="/collections/center?tab=report" replace />;
  }
  return <Navigate to="/" replace />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <OfflineSyncProvider>
        <SafariStreamProvider>
        <BrowserRouter>
          <OfflineGlobalAlerts />
          <Suspense fallback={<RouteSuspenseFallback />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/force-change-password" element={<ForceChangePasswordPage />} />
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
                path="/driver/tasks"
                element={
                  <RequireRole role="DRIVER">
                    <DriverTasksPage />
                  </RequireRole>
                }
              />
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
                <Route path="403" element={<ForbiddenPage />} />
                {/*
                  Unified dashboard. Single cash-intelligence-backed
                  surface for OWNER / GM / MANAGER / ACCOUNTANT.
                  The classifier is the single source of truth and the
                  backend clamps `branchId` for MANAGER, so the same
                  component renders the right scope for each role.
                */}
                <Route
                  path="dashboard"
                  element={
                    <RequireAccess access="executiveDashboard.view">
                      <ExecutiveDashboardPage />
                    </RequireAccess>
                  }
                />
                {/* Legacy dashboards — redirected to the unified one. */}
                <Route
                  path="admin/dashboard"
                  element={<Navigate to="/dashboard" replace />}
                />
                <Route
                  path="owner-dashboard"
                  element={<Navigate to="/dashboard" replace />}
                />
                <Route
                  path="users-management"
                  element={
                    <RequireAccess access="branches.manage">
                      <OwnerDashboard />
                    </RequireAccess>
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
                {/*
                  V19.x — Call Center → Customer 360 Dashboard.
                  Single-entry workspace for CC agents and supervisors:
                    - /cc/dashboard           → search landing
                    - /cc/customers/:id       → 360 + tabs (Overview /
                                                Dispatch / Risk / Audit)
                  Gated by `ccDashboard.view` (CC + CC supervisor +
                  exec pair). The 360 backend endpoint is CC-only at
                  the controller layer, so OWNER/GM landing here
                  through deep-links would still get 403 from the
                  server — the matrix mirrors that intent.
                */}
                <Route
                  path="cc/dashboard"
                  element={
                    <RequireAccess access="ccDashboard.view">
                      <CcDashboardPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="cc/customers/:customerId"
                  element={
                    <RequireAccess access="ccDashboard.view">
                      <CcCustomer360Page />
                    </RequireAccess>
                  }
                />
                {/*
                  V22 Phase 5 — Customer360 v2 (Operational Command
                  Center). Additive sibling of the v1 tabbed page
                  above. Same access gate, different layout: 3-pane
                  command-center with a sticky action bar, smart
                  hints, and live SSE refresh on the canonical
                  `customer360` channel. The v1 page still owns
                  every mutation dialog, so v2 is read-first while
                  we observe adoption.
                */}
                <Route
                  path="cc/customers/:customerId/360"
                  element={
                    <RequireAccess access="ccDashboard.view">
                      <CcCustomer360V2Page />
                    </RequireAccess>
                  }
                />
                {/* V19.x — Outstanding Payments / Accounts-Receivable.
                  Visible to CC + CC Supervisor + Owner/GM/Accountant.
                  Mutations (status change, manual block toggle) are
                  restricted server-side to CC/CC-supervisor/Owner.
                */}
                <Route
                  path="cc/control-tower"
                  element={
                    <RequireAccess access="controlTower.view">
                      <ControlTowerPage />
                    </RequireAccess>
                  }
                />
                {/* V20.x — لوحة التحصيل (Collections Report) replaces the
                  legacy "Outstanding (AR)" page. The old `/cc/outstanding`
                  path keeps redirecting here so existing bookmarks /
                  permalinks don't 404. */}
                <Route
                  path="cc/collections-report"
                  element={<Navigate to="/collections/center?tab=report" replace />}
                />
                <Route
                  path="cc/outstanding"
                  element={<Navigate to="/collections/center?tab=report" replace />}
                />
                <Route
                  path="customer-statement-journal"
                  element={
                    <RequireAccess access="journalStatement.view">
                      <CustomerStatementJournalPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="accountant/double-entry-journal"
                  element={
                    <RequireAccess access="doubleEntryJournal.view">
                      <AccountantDoubleEntryJournalPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="my-customer-360"
                  element={
                    <RequireAccess access="customer360.self">
                      <CustomerPortal360Page />
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
                {/* Unified collections hub + legacy redirects */}
                <Route path="collections" element={<CollectionsDefaultRedirect />} />
                <Route
                  path="collections/center"
                  element={
                    <RequireAccess access="outstanding.view">
                      <CollectionsCenterPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="collections/classic"
                  element={
                    <RequireAccess access="collections.view">
                      <CollectionsPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="collections/cockpit"
                  element={<Navigate to="/collections/center?tab=work" replace />}
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
                  path="cc/website-orders"
                  element={
                    <RequireAccess access="websiteOrderRequests.view">
                      <WebsiteOrderRequestsPage />
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
                {/*
                  V19.33 — Branch Manager Dashboard.
                  Branch-scoped read-only dashboard (driver performance,
                  cash flow chain, alerts, inventory snapshot, driver
                  timeline drill-down). Backend clamps `branchId` to the
                  JWT branch on every read so this UI cannot leak across
                  branches.
                */}
                {/* Legacy manager dashboard — folded into /dashboard. */}
                <Route
                  path="manager/dashboard"
                  element={<Navigate to="/dashboard" replace />}
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
                  element={
                    <RequireAccess access="payroll.view">
                      <PayslipPrintPage />
                    </RequireAccess>
                  }
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
                  element={<Navigate to="/expenses/approval" replace />}
                />
                <Route
                  path="expenses/approval"
                  element={
                    <RequireAccess access="expenseApproval.view">
                      <ExpenseApprovalPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="vehicle-expenses"
                  element={<Navigate to="/expenses/cars" replace />}
                />
                <Route
                  path="vehicle-expenses/approval"
                  element={<Navigate to="/expenses/cars" replace />}
                />
                <Route
                  path="vehicle-expenses/report"
                  element={<Navigate to="/expenses/cars" replace />}
                />
                <Route
                  path="vehicle-expenses/*"
                  element={<Navigate to="/expenses/cars" replace />}
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
                  path="accountant-dashboard"
                  element={
                    <RequireAccess access="accountantDashboard.view">
                      <AccountantDashboardPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="cash-reconciliation"
                  element={
                    <RequireAccess access="cashReconciliation.view">
                      <CashReconciliationPage />
                    </RequireAccess>
                  }
                />
                {/* Legacy cash-control panel — folded into /dashboard. */}
                <Route
                  path="cash-control"
                  element={<Navigate to="/dashboard" replace />}
                />
                <Route
                  path="audit-logs"
                  element={
                    <RequireOwnerOrGeneralManager>
                      <AuditLogsPage />
                    </RequireOwnerOrGeneralManager>
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
                  path="reports/sales-summary"
                  element={
                    <RequireAccess access="reports.view">
                      <SalesSummaryReportPage />
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
                  path="finance/reports"
                  element={
                    <RequireAccess access="financeLedgerReports.view">
                      <FinanceLedgerReportsPage />
                    </RequireAccess>
                  }
                />
                <Route
                  path="finance/ledger/bank-statement"
                  element={
                    <RequireAccess access="financeLedgerReports.view">
                      <LedgerBankStatementPage />
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
                  path="expenses/reports"
                  element={
                    <RequireAccess access="expenses.view">
                      <ExpensesPage mode="reports" />
                    </RequireAccess>
                  }
                />
                <Route
                  path="expenses/cars"
                  element={
                    <RequireAccess access="expenses.view">
                      <ExpensesPage mode="cars" />
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
          </Suspense>
        </BrowserRouter>
        <AppToaster />
        </SafariStreamProvider>
        </OfflineSyncProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
