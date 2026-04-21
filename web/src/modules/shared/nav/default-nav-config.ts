import type { NavGroup } from '@/modules/shared/nav/nav-types';
import {
  attendanceItem,
  branchesItem,
  collectionsItem,
  customersItem,
  dashboardItem,
  debtRecoveryReportItem,
  debtTransfersItem,
  driverMonitorItem,
  expenseApprovalItem,
  expensesItem,
  financialCycleReportItem,
  financialsItem,
  fixedExpensesItem,
  insightsAiItem,
  inventoryCatalogItem,
  inventoryLowStockItem,
  inventoryMovementsItem,
  invoicesDataItem,
  invoiceAuditItem,
  ccPerformanceItem,
  knetAuditReportItem,
  leavesItem,
  loansItem,
  manageItemsItem,
  managerCustodyAgingItem,
  ownerInventoryItem,
  ownerSerialsItem,
  payrollItem,
  purchaseOrdersItem,
  reportsItem,
  shiftsItem,
  staffDebtsItem,
  subscribersItem,
  subscriptionsItem,
  teamItem,
  unifiedLedgerItem,
  whatsappToolsItem,
} from '@/modules/shared/nav/nav-items';

/**
 * V19.3 — OWNER + GENERAL_MANAGER sidebar, reorganised into six semantic
 * islands with matching tone hints so the hierarchy reads at a glance:
 *
 *   1. Home                    (dashboard entry)
 *   2. 📊 Finance & Reports    (blue)
 *   3. 👥 Human Resources      (green)
 *   4. 📦 Inventory & Ops      (orange)
 *   5. 👨‍💼 Customers & Subs    (purple)
 *   6. 💳 Payment & Collection (red)
 *   7. ⚙️ Admin & Settings     (gray)
 *
 * Dastur rules still encoded by omission:
 *   • No `posItem` / driver-personal items (MANAGER/DRIVER territory).
 *   • `driverMonitorItem.roles = ['OWNER']` — GM loses Pulse via filter.
 *   • Hard-delete actions continue to be gated by the access matrix.
 *
 * Note: the legacy OWNER layout duplicated `/orders` (as both
 * `ordersItem` and `invoicesDataItem`). We keep only `invoicesDataItem`
 * under "Payment & Collection" so the sidebar does not present two
 * entries for the same route.
 */
export const defaultSidebarNavGroups: NavGroup[] = [
  {
    labelKey: 'nav.groupMain',
    items: [dashboardItem],
  },
  {
    labelKey: 'nav.groupFinance',
    tone: 'blue',
    items: [
      financialsItem,
      reportsItem,
      financialCycleReportItem,
      knetAuditReportItem,
      unifiedLedgerItem,
      insightsAiItem,
      expenseApprovalItem,
      debtTransfersItem,
      fixedExpensesItem,
      expensesItem,
    ],
  },
  {
    labelKey: 'nav.groupHr',
    tone: 'green',
    items: [payrollItem, attendanceItem, leavesItem, loansItem],
  },
  {
    labelKey: 'nav.groupInventoryOps',
    tone: 'orange',
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
    labelKey: 'nav.groupCustomersSubs',
    tone: 'purple',
    items: [
      customersItem,
      collectionsItem,
      subscriptionsItem,
      subscribersItem,
    ],
  },
  {
    labelKey: 'nav.groupPaymentCollection',
    tone: 'red',
    items: [
      invoicesDataItem,
      invoiceAuditItem,
      ccPerformanceItem,
      debtRecoveryReportItem,
      managerCustodyAgingItem,
      staffDebtsItem,
    ],
  },
  {
    labelKey: 'nav.groupAdminSettings',
    tone: 'gray',
    items: [
      teamItem,
      branchesItem,
      driverMonitorItem,
      shiftsItem,
      whatsappToolsItem,
    ],
  },
];
