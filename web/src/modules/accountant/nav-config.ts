import type { NavGroup } from '@/modules/shared/nav/nav-types';
import { G } from '@/modules/shared/nav/nav-groups';
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
  managerCustodyAgingItem,
  payrollItem,
  shiftsItem,
  staffDebtsItem,
  unifiedLedgerItem,
  vehicleExpensesApprovalItem,
  vehicleExpensesReportItem,
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
    ...G.invoices,
    items: [allInvoicesItem],
  },
  {
    ...G.finance,
    items: [
      unifiedLedgerItem,
      knetAuditItem,
      invoiceAuditItem,
      expenseApprovalItem,
      vehicleExpensesApprovalItem,
      vehicleExpensesReportItem,
      debtTransfersItem,
      insightsAiItem,
    ],
  },
  {
    ...G.paymentCollection,
    items: [
      invoicesDataItem,
      managerCustodyAgingItem,
      staffDebtsItem,
    ],
  },
  {
    ...G.inventoryOps,
    items: [
      accountantInventoryItem,
      accountantStockInItem,
      inventoryLowStockItem,
      inventoryOperationsItem,
      inventoryMovementsItem,
      inventoryCatalogItem,
      purchaseOrdersItem,
    ],
  },
  {
    ...G.operations,
    items: [shiftsItem],
  },
  {
    ...G.adminSettings,
    items: [payrollItem, attendanceItem],
  },
];
