import type { NavGroup } from '@/modules/shared/nav/nav-types';
import {
  accountantInventoryItem,
  accountantStockInItem,
  expenseApprovalItem,
  invoicesDataItem,
  knetAuditItem,
  managerCustodyAgingItem,
  movementLogsItem,
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
    items: [movementLogsItem, unifiedLedgerItem, shiftsItem],
  },
  {
    labelKey: 'nav.groupAudit',
    items: [
      knetAuditItem,
      expenseApprovalItem,
      managerCustodyAgingItem,
      staffDebtsItem,
    ],
  },
  {
    labelKey: 'nav.groupOperations',
    items: [invoicesDataItem, accountantInventoryItem, accountantStockInItem],
  },
];
