import type { NavGroup } from '@/modules/shared/nav/nav-types';
import {
  branchesItem,
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
  invoicesDataItem,
  manageItemsItem,
  managerCustodyAgingItem,
  ownerInventoryItem,
  ownerSerialsItem,
  myDailySalesItem,
  ordersItem,
  payrollItem,
  staffDebtsItem,
  posItem,
  reportsItem,
  shiftsItem,
  subscribersItem,
  subscriptionsItem,
  collectionsItem,
  teamItem,
  unifiedLedgerItem,
  whatsappToolsItem,
} from '@/modules/shared/nav/nav-items';

/**
 * Full navigation for OWNER, MANAGER, SUPERVISOR, VIEWER, WORKER, and default
 * fallbacks.
 *
 * V18.0 — "Owner Dashboard" and "Radar" sidebar entries are retired:
 * - OWNER's landing page now redirects straight to Financial Reports.
 * - `/admin/live-monitor` is still accessible via the Safari Pulse button in
 *   the executive header (same OWNER-only guard); it is no longer in the
 *   sidebar to reduce clutter.
 * A new "System Settings" group hosts Branch Management and Users Management.
 */
export const defaultSidebarNavGroups: NavGroup[] = [
  {
    labelKey: 'nav.groupMain',
    items: [
      posItem,
      manageItemsItem,
      ownerInventoryItem,
      dashboardItem,
      customersItem,
      myDailySalesItem,
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
    labelKey: 'nav.groupFinance',
    items: [
      financialsItem,
      knetAuditReportItem,
      expenseApprovalItem,
      financialCycleReportItem,
      managerCustodyAgingItem,
      staffDebtsItem,
      debtRecoveryReportItem,
      reportsItem,
      unifiedLedgerItem,
      payrollItem,
      fixedExpensesItem,
      expensesItem,
    ],
  },
  {
    labelKey: 'nav.groupSystemSettings',
    items: [branchesItem, teamItem, whatsappToolsItem],
  },
];
