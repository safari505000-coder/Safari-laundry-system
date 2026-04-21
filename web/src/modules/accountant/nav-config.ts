import type { NavGroup } from '@/modules/shared/nav/nav-types';
import {
  accountantInventoryItem,
  accountantStockInItem,
  allInvoicesItem,
  attendanceItem,
  debtTransfersItem,
  expenseApprovalItem,
  inventoryCatalogItem,
  inventoryLowStockItem,
  inventoryMovementsItem,
  inventoryOperationsItem,
  insightsAiItem,
  purchaseOrdersItem,
  invoicesDataItem,
  invoiceAuditItem,
  knetAuditItem,
  leavesItem,
  loansItem,
  managerCustodyAgingItem,
  payrollItem,
  shiftsItem,
  staffDebtsItem,
  unifiedLedgerItem,
} from '@/modules/shared/nav/nav-items';

/*
 * Dastur §2.2 — Accountant workspace is strictly liability-only.
 * The "الرادار / نبض سفاري" (Live Monitor / Safari Pulse) entry is
 * intentionally omitted here: that island is OWNER-only and exposes
 * signals the ACCOUNTANT must never see. Keep this file clean of any
 * radar/pulse import to guarantee total invisibility of that surface.
 *
 * Also excluded: `driverMonitorItem` — its `roles` array is `['OWNER']`
 * only (see access-matrix `driverMonitor.view`), so leaving it here was
 * dead weight that the role filter would strip at runtime anyway.
 */
export const accountantSidebarNavGroups: NavGroup[] = [
  {
    labelKey: 'nav.groupDriverRadar',
    items: [unifiedLedgerItem, shiftsItem],
  },
  {
    labelKey: 'nav.groupAudit',
    items: [
      knetAuditItem,
      invoiceAuditItem,
      expenseApprovalItem,
      managerCustodyAgingItem,
      staffDebtsItem,
      debtTransfersItem,
    ],
  },
  {
    labelKey: 'nav.groupInvoices',
    items: [allInvoicesItem],
  },
  {
    labelKey: 'nav.groupOperations',
    items: [
      invoicesDataItem,
      accountantInventoryItem,
      accountantStockInItem,
    ],
  },
  {
    labelKey: 'nav.groupInventory',
    items: [
      inventoryLowStockItem,
      inventoryOperationsItem,
      inventoryMovementsItem,
      inventoryCatalogItem,
      purchaseOrdersItem,
    ],
  },
  // Stage-D — Payroll / HR workbench. Accountant approves leaves,
  // loans and signs off payslips; attendance view is read-only audit.
  {
    labelKey: 'nav.groupHr',
    items: [payrollItem, attendanceItem, leavesItem, loansItem],
  },
  // Stage-C — AI insights (financial tabs only for accountant; the
  // executive-weekly and driver-scorecard tabs hide themselves via
  // the access matrix).
  {
    labelKey: 'nav.groupIntelligence',
    items: [insightsAiItem],
  },
];
