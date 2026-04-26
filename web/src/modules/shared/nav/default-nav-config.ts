import type { NavGroup } from '@/modules/shared/nav/nav-types';
import { G } from '@/modules/shared/nav/nav-groups';
import {
  branchesItem,
  collectionsItem,
  customersItem,
  dashboardItem,
  feedbackInboxItem,
  debtRecoveryReportItem,
  debtTransfersItem,
  driverCashTraceItem,
  driverMonitorItem,
  expenseApprovalItem,
  expensesItem,
  financialReportsHubItem,
  fixedExpensesItem,
  monthlySummaryItem,
  moneyFlowStatementItem,
  operationalReportsHubItem,
  inventoryCatalogItem,
  inventoryLowStockItem,
  inventoryMovementsItem,
  allInvoicesItem,
  invoicesDataItem,
  invoiceAuditItem,
  ccPerformanceItem,
  manageItemsItem,
  managerCustodyAgingItem,
  ownerInventoryItem,
  ownerSerialsItem,
  purchaseOrdersItem,
  shiftsItem,
  staffDebtsItem,
  staffHubItem,
  subscribersItem,
  subscriptionsItem,
  teamItem,
  unpaidInvoicesItem,
  vehicleExpensesApprovalItem,
  vehicleExpensesReportItem,
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
      collectionsItem,
      feedbackInboxItem,
      subscriptionsItem,
      subscribersItem,
    ],
  },
  {
    ...G.invoices,
    items: [allInvoicesItem],
  },
  {
    ...G.finance,
    items: [
      monthlySummaryItem,
      moneyFlowStatementItem,
      financialReportsHubItem,
      operationalReportsHubItem,
      expenseApprovalItem,
      vehicleExpensesApprovalItem,
      vehicleExpensesReportItem,
      debtTransfersItem,
      fixedExpensesItem,
      expensesItem,
    ],
  },
  {
    ...G.paymentCollection,
    items: [
      invoicesDataItem,
      invoiceAuditItem,
      ccPerformanceItem,
      debtRecoveryReportItem,
      managerCustodyAgingItem,
      driverCashTraceItem,
      unpaidInvoicesItem,
      staffDebtsItem,
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
    // V19.17 — Staff/HR operational surfaces (payroll, attendance,
    // commission payouts, debt holds, commission rules, system
    // settings) live as internal tabs on the dedicated `staffHubItem`
    // page (`/staff-hub`). The `teamItem` (`/owner-dashboard`) stays
    // focused on user accounts + branch registry only.
    ...G.adminSettings,
    items: [
      teamItem,
      staffHubItem,
      branchesItem,
      driverMonitorItem,
      shiftsItem,
    ],
  },
];
