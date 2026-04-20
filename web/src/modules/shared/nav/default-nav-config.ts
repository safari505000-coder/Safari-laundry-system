import type { NavGroup } from '@/modules/shared/nav/nav-types';
import {
  attendanceItem,
  branchesItem,
  leavesItem,
  loansItem,
  customersItem,
  dashboardItem,
  debtRecoveryReportItem,
  expenseApprovalItem,
  knetAuditReportItem,
  driverMonitorItem,
  expensesItem,
  financialCycleReportItem,
  financialsItem,
  fixedExpensesItem,
  inventoryCatalogItem,
  inventoryLowStockItem,
  inventoryMovementsItem,
  inventoryOperationsItem,
  insightsAiItem,
  invoicesDataItem,
  manageItemsItem,
  managerCustodyAgingItem,
  ownerInventoryItem,
  ownerSerialsItem,
  ordersItem,
  payrollItem,
  staffDebtsItem,
  reportsItem,
  shiftsItem,
  subscribersItem,
  subscriptionsItem,
  collectionsItem,
  debtTransfersItem,
  teamItem,
  unifiedLedgerItem,
  whatsappToolsItem,
} from '@/modules/shared/nav/nav-items';

/**
 * Executive sidebar for OWNER (and, via resolve-sidebar-nav, for
 * GENERAL_MANAGER — see §3.9 unification). SUPERVISOR / VIEWER / WORKER /
 * fallbacks also land here.
 *
 * Dastur rules encoded by omission:
 *   • No `posItem` — POS is MANAGER/DRIVER territory (pos.use matrix).
 *   • No driver-personal items (myDeposits, myDailySales, myFieldExpenses).
 *   • `driverMonitorItem` has `roles: ['OWNER']` so the role filter hides
 *     it from GM automatically — that's the "minus Pulse" half of F.
 */
export const defaultSidebarNavGroups: NavGroup[] = [
  {
    labelKey: 'nav.groupMain',
    items: [
      manageItemsItem,
      ownerInventoryItem,
      dashboardItem,
      customersItem,
      collectionsItem,
      subscriptionsItem,
      subscribersItem,
      driverMonitorItem,
    ],
  },
  {
    labelKey: 'nav.groupOperations',
    items: [invoicesDataItem, ordersItem, shiftsItem, ownerSerialsItem],
  },
  {
    labelKey: 'nav.groupInventory',
    items: [
      inventoryLowStockItem,
      inventoryMovementsItem,
      inventoryOperationsItem,
      inventoryCatalogItem,
    ],
  },
  {
    labelKey: 'nav.groupIntelligence',
    items: [insightsAiItem],
  },
  {
    labelKey: 'nav.groupFinance',
    items: [
      financialsItem,
      knetAuditReportItem,
      expenseApprovalItem,
      financialCycleReportItem,
      managerCustodyAgingItem,
      staffDebtsItem,
      debtRecoveryReportItem,
      debtTransfersItem,
      reportsItem,
      unifiedLedgerItem,
      payrollItem,
      attendanceItem,
      leavesItem,
      loansItem,
      fixedExpensesItem,
      expensesItem,
    ],
  },
  {
    labelKey: 'nav.groupSystemSettings',
    items: [branchesItem, teamItem, whatsappToolsItem],
  },
];
