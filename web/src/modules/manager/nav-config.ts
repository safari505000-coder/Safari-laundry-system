import type { NavGroup } from '@/modules/shared/nav/nav-types';
import { G } from '@/modules/shared/nav/nav-groups';
import {
  attendanceItem,
  dashboardItem,
  driverOversightItem,
  expensesItem,
  insightsAiItem,
  inventoryOperationsItem,
  myCustodyItem,
  myDocumentsItem,
  ordersItem,
  posItem,
  shiftsItem,
} from '@/modules/shared/nav/nav-items';

/**
 * V19.9.5 — MANAGER sidebar, rewired on the canonical group shells.
 *
 * Dastur §3 rules still encoded by omission: no /collect-driver-cash
 * (merged into /manager/custody), no HR self-service (/leaves,
 * /loans removed from sidebar).
 */
export const managerSidebarNavGroups: NavGroup[] = [
  {
    ...G.main,
    items: [posItem, dashboardItem, ordersItem],
  },
  {
    ...G.finance,
    items: [expensesItem, myCustodyItem, myDocumentsItem],
  },
  {
    ...G.inventoryOps,
    items: [inventoryOperationsItem],
  },
  {
    // V19.22.5 — Driver Oversight + Shifts are both operational,
    // branch-scoped monitoring surfaces — grouped together so the
    // manager sees them side-by-side.
    ...G.operations,
    items: [driverOversightItem, shiftsItem],
  },
  {
    ...G.adminSettings,
    items: [attendanceItem, insightsAiItem],
  },
];
