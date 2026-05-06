import type { NavGroup } from '@/modules/shared/nav/nav-types';
import { G } from '@/modules/shared/nav/nav-groups';
import {
  accountantDashboardItem,
  accountantInventoryItem,
  accountantStockInItem,
  allInvoicesItem,
  attendanceItem,
  carExpensesItem,
  customersItem,
  debtTransfersItem,
  driverCashTraceItem,
  cashReconciliationItem,
  expenseApprovalItem,
  expenseReportsItem,
  inventoryCatalogItem,
  inventoryLowStockItem,
  inventoryMovementsItem,
  inventoryOperationsItem,
  operationalReportsHubItem,
  purchaseOrdersItem,
  invoiceAuditItem,
  journalStatementItem,
  knetAuditItem,
  managerCustodyAgingItem,
  moneyFlowStatementItem,
  payrollItem,
  salesSummaryReportItem,
  shiftsItem,
  unifiedLedgerItem,
  unpaidInvoicesItem,
} from '@/modules/shared/nav/nav-items';

/**
 * V19.9.5 — ACCOUNTANT sidebar on canonical shells.
 *
 * Dastur §2.2 still encoded by omission: no Live Monitor / Safari
 * Pulse (OWNER-only cockpit), no /collect-driver-cash (merged), no
 * HR self-service (/leaves, /loans stripped from sidebar). The
 * duplicate inventory group from the pre-refresh layout was merged
 * into a single `groupInventoryOps` so everyone sees the same bucket.
 */
export const accountantSidebarNavGroups: NavGroup[] = [
  {
    ...G.customersSubs,
    items: [customersItem, journalStatementItem],
  },
  {
    ...G.finance,
    items: [
      allInvoicesItem,
      unifiedLedgerItem,
      accountantDashboardItem,
      knetAuditItem,
      moneyFlowStatementItem,
      salesSummaryReportItem,
      invoiceAuditItem,
      operationalReportsHubItem,
    ],
  },
  {
    ...G.expenses,
    items: [
      expenseApprovalItem,
      expenseReportsItem,
      carExpensesItem,
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
    ],
  },
  {
    ...G.inventoryOps,
    items: [
      accountantInventoryItem,
      inventoryLowStockItem,
      inventoryMovementsItem,
      purchaseOrdersItem,
      inventoryCatalogItem,
      inventoryOperationsItem,
      accountantStockInItem,
    ],
  },
  {
    ...G.operations,
    items: [shiftsItem, attendanceItem],
  },
  {
    ...G.adminSettings,
    items: [payrollItem],
  },
];
