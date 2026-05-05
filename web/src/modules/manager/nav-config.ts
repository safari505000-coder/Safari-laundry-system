import type { NavGroup } from '@/modules/shared/nav/nav-types';
import { G } from '@/modules/shared/nav/nav-groups';
import {
  attendanceItem,
  dashboardItem,
  driverOversightItem,
  expenseInputItem,
  operationalReportsHubItem,
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
 *
 * STRICT ROLE-BASED EXPENSE DESIGN — Part 3 / Part 4.
 *
 * Branch managers see ONLY operational data + the expense input
 * surface. `expenseReportsItem` (analytics dashboard with totals,
 * trends, %, employee comparisons) and `carExpensesItem` (vehicle
 * expenses — owned by fleet, not branch) were removed because
 * "expenses increased N%", "highest employee spending" and similar
 * financial intelligence belongs to OWNER / GENERAL_MANAGER /
 * ACCOUNTANT only. The new `expenseInputItem` points at the
 * input-only expenses page.
 */
export const managerSidebarNavGroups: NavGroup[] = [
  {
    ...G.main,
    items: [posItem, dashboardItem, ordersItem],
  },
  {
    ...G.expenses,
    items: [expenseInputItem, myDocumentsItem],
  },
  {
    ...G.cashDebt,
    items: [myCustodyItem],
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
    items: [attendanceItem, operationalReportsHubItem],
  },
];
