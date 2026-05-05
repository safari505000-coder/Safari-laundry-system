/**
 * Maps the current URL (or a synthetic override) to an `operatorHints.routes.*`
 * i18n slug. Used by `OperatorRouteHint` so every main screen can show a short
 * operator-facing explanation without duplicating JSX on dozens of pages.
 */

const EXACT: Record<string, string> = {
  '/': 'dashboard',
  '/dashboard': 'dashboard',
  '/staff-hub': 'staffHub',
  '/branches': 'branches',
  '/manage-items': 'manageItems',
  '/knet-audit': 'knetAudit',
  '/owner/inventory': 'ownerInventory',
  '/accountant/inventory': 'accountantInventory',
  '/accountant/stock-in': 'accountantStockIn',
  '/inventory/catalog': 'inventoryCatalog',
  '/inventory/operations': 'inventoryOperations',
  '/inventory/movements': 'inventoryMovements',
  '/inventory/low-stock': 'inventoryLowStock',
  '/purchase-orders': 'purchaseOrders',
  '/customers': 'customers',
  '/collections': 'collections',
  '/my-deposits': 'myDeposits',
  '/whatsapp-tools': 'whatsappTools',
  '/my-daily-sales': 'myDailySales',
  '/my-cash-receipts': 'myCashReceipts',
  '/my-field-expenses': 'myFieldExpenses',
  '/driver/pending-invoices': 'driverPendingInvoices',
  '/admin/driver-monitoring': 'driverMonitoring',
  '/admin/live-monitor': 'liveMonitor',
  '/subscriptions': 'subscriptions',
  '/subscribers': 'subscribers',
  '/orders': 'orders',
  '/invoices': 'invoicesBrowse',
  '/shifts': 'shifts',
  '/manager/custody': 'managerCustody',
  '/manager/my-documents': 'managerDocuments',
  '/feedback': 'feedbackInbox',
  '/manager/driver-oversight': 'driverOversight',
  '/finance/manager-custody-aging': 'managerCustodyAging',
  '/staff-debts': 'staffDebts',
  '/owner/serials': 'ownerSerials',
  '/owner/debt-recovery': 'debtRecovery',
  '/financials': 'financials',
  '/monthly-summary': 'monthlySummary',
  '/money-flow-statement': 'moneyFlowStatement',
  '/insights/ai': 'insightsAi',
  '/finance/debt-transfers': 'debtTransfers',
  '/my/debt-transfers': 'myDebtTransfers',
  '/attendance': 'attendance',
  '/expense-approval': 'expenseApproval',
  '/vehicle-expenses': 'vehicleExpensesMine',
  '/vehicle-expenses/approval': 'vehicleExpensesApproval',
  '/vehicle-expenses/report': 'vehicleExpensesReport',
  '/financial-cycle-report': 'financialCycleReport',
  '/driver-cash-trace': 'driverCashTrace',
  '/accountant-dashboard': 'accountantDashboard',
  '/cash-reconciliation': 'cashReconciliation',
  '/unpaid-invoices': 'unpaidInvoices',
  '/reports': 'reports',
  '/reports-hub': 'reportsHub',
  '/operational-reports-hub': 'operationalReportsHub',
  '/unified-ledger': 'unifiedLedger',
  '/payroll': 'payroll',
  '/settings/dashboard': 'systemSettings',
  '/settings/commission-rules': 'commissionRules',
  '/commission-payouts': 'commissionPayouts',
  '/debt-holds': 'debtHolds',
  '/fixed-expenses': 'fixedExpenses',
  '/expenses': 'expenses',
  '/cc-performance': 'ccPerformance',
  '/invoice-audit': 'invoiceAudit',
  '/__hint/pos-driver': 'posDriver',
  '/__hint/pos-manager': 'posManager',
};

const RE_SLUGS: Array<{ re: RegExp; slug: string }> = [
  { re: /^\/invoices\/[^/]+\/print$/, slug: 'invoicePrint' },
  { re: /^\/my-cash-receipts\/[^/]+\/print$/, slug: 'myCashReceiptsPrint' },
  {
    re: /^\/my-documents\/expense\/[^/]+\/print$/,
    slug: 'expenseVoucherPrint',
  },
  { re: /^\/payroll\/[^/]+\/print$/, slug: 'payslipPrint' },
  { re: /^\/payroll\/roster\/print$/, slug: 'payrollRosterPrint' },
  { re: /^\/attendance\/print$/, slug: 'attendancePrint' },
  { re: /^\/leaves\/[^/]+\/print$/, slug: 'leavePrint' },
  { re: /^\/loans\/[^/]+\/print$/, slug: 'loanPrint' },
  {
    re: /^\/customers\/[^/]+\/statement\/print$/,
    slug: 'statementPrint',
  },
  { re: /^\/monthly-summary\/print$/, slug: 'monthlySummaryPrint' },
];

export function operatorHintSlugForPath(pathname: string): string | null {
  const p =
    pathname.length > 1 ? pathname.replace(/\/+$/, '') || '/' : pathname;
  if (EXACT[p]) return EXACT[p];
  for (const { re, slug } of RE_SLUGS) {
    if (re.test(p)) return slug;
  }
  return null;
}
