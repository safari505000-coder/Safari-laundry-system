import type { NavGroup } from '@/modules/shared/nav/nav-types';
import { G } from '@/modules/shared/nav/nav-groups';
import {
  attendanceItem,
  branchesItem,
  collectionsItem,
  customersItem,
  dashboardItem,
  debtRecoveryReportItem,
  debtTransfersItem,
  driverCashTraceItem,
  driverMonitorItem,
  expenseApprovalItem,
  expensesItem,
  financialReportsHubItem,
  fixedExpensesItem,
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
  payrollItem,
  purchaseOrdersItem,
  shiftsItem,
  staffDebtsItem,
  subscribersItem,
  subscriptionsItem,
  teamItem,
  unpaidInvoicesItem,
  vehicleExpensesApprovalItem,
  vehicleExpensesReportItem,
  whatsappToolsItem,
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
    items: [customersItem, collectionsItem, subscriptionsItem, subscribersItem],
  },
  {
    ...G.invoices,
    items: [allInvoicesItem],
  },
  {
    ...G.finance,
    items: [
      financialReportsHubItem,
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
    ...G.adminSettings,
    items: [
      teamItem,
      branchesItem,
      driverMonitorItem,
      shiftsItem,
      whatsappToolsItem,
      payrollItem,
      attendanceItem,
    ],
  },
];
