import type { NavGroup } from '@/modules/shared/nav/nav-types';
import { G } from '@/modules/shared/nav/nav-groups';
import {
  accountantDashboardItem,
  auditLogsItem,
  branchesItem,
  callIncomingItem,
  collectionsItem,
  controlTowerItem,
  outstandingPaymentsItem,
  customersItem,
  dashboardItem,
  feedbackInboxItem,
  debtRecoveryReportItem,
  debtTransfersItem,
  driverCashTraceItem,
  cashReconciliationItem,
  driverMonitorItem,
  carExpensesItem,
  expenseApprovalItem,
  expenseReportsItem,
  financialReportsHubItem,
  fixedExpensesItem,
  attendanceItem,
  monthlySummaryItem,
  moneyFlowStatementItem,
  myCustodyItem,
  operationalReportsHubItem,
  inventoryCatalogItem,
  inventoryLowStockItem,
  inventoryMovementsItem,
  allInvoicesItem,
  invoiceAuditItem,
  journalStatementItem,
  ccPerformanceItem,
  manageItemsItem,
  managerCustodyAgingItem,
  ownerInventoryItem,
  ownerSerialsItem,
  purchaseOrdersItem,
  salesSummaryReportItem,
  shiftsItem,
  staffHubItem,
  subscribersItem,
  subscriptionsItem,
  teamItem,
  unifiedLedgerItem,
  unpaidInvoicesItem,
} from '@/modules/shared/nav/nav-items';

/**
 * V19.9.5 — OWNER + GENERAL_MANAGER (default) sidebar.
 *
 * Consumes the canonical group shells from `nav-groups.ts` so every
 * role renders the SAME group labels and tones in the SAME order.
 * Owner populates every shell except Field Operations (which is
 * driver-specific) and Main stays unadorned.
 *
 * HR self-service (`leavesItem`, `loansItem`) no longer ship in any
 * sidebar; payroll + attendance migrated into Admin & Settings.
 */
export const defaultSidebarNavGroups: NavGroup[] = [
  {
    ...G.main,
    items: [dashboardItem],
  },
  {
    ...G.customersSubs,
    items: [
      customersItem,
      journalStatementItem,
      callIncomingItem,
      collectionsItem,
      outstandingPaymentsItem,
      controlTowerItem,
      feedbackInboxItem,
      subscriptionsItem,
      subscribersItem,
    ],
  },
  {
    ...G.financialManagement,
    items: [auditLogsItem],
  },
  {
    ...G.finance,
    items: [
      allInvoicesItem,
      unifiedLedgerItem,
      accountantDashboardItem,
      moneyFlowStatementItem,
      salesSummaryReportItem,
      financialReportsHubItem,
      monthlySummaryItem,
      operationalReportsHubItem,
      invoiceAuditItem,
      ccPerformanceItem,
    ],
  },
  {
    ...G.expenses,
    items: [
      expenseApprovalItem,
      expenseReportsItem,
      carExpensesItem,
      fixedExpensesItem,
    ],
  },
  {
    ...G.cashDebt,
    items: [
      managerCustodyAgingItem,
      driverCashTraceItem,
      cashReconciliationItem,
      unpaidInvoicesItem,
      debtTransfersItem,
      myCustodyItem,
      debtRecoveryReportItem,
    ],
  },
  {
    ...G.inventoryOps,
    items: [
      manageItemsItem,
      ownerInventoryItem,
      ownerSerialsItem,
      inventoryLowStockItem,
      inventoryMovementsItem,
      inventoryCatalogItem,
      purchaseOrdersItem,
    ],
  },
  {
    ...G.operations,
    items: [driverMonitorItem, shiftsItem, attendanceItem],
  },
  {
    // V19.17 — Staff/HR operational surfaces (payroll, attendance,
    // commission payouts, debt holds, commission rules, system
    // settings) live as internal tabs on the dedicated `staffHubItem`
    // page (`/staff-hub`). The `teamItem` (`/users-management`) stays
    // focused on user accounts + branch registry only.
    ...G.adminSettings,
    items: [
      teamItem,
      staffHubItem,
      branchesItem,
    ],
  },
];
