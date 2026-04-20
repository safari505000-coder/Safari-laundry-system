import type { NavGroup } from '@/modules/shared/nav/nav-types';
import {
  attendanceItem,
  dashboardItem,
  expensesItem,
  insightsAiItem,
  inventoryOperationsItem,
  leavesItem,
  loansItem,
  myCustodyItem,
  ordersItem,
  posItem,
  shiftsItem,
} from '@/modules/shared/nav/nav-items';

/*
 * Dastur §3 — Manager's single-page custody flow.
 *
 * The old "تصفية الموظفين" / /collect-driver-cash menu item has been removed
 * intentionally. Driver handover approval now happens inline on the
 * Manager Custody page (myCustodyItem → /manager/custody) via a single
 * Confirm-Receipt click per driver, followed by the bulk bank-deposit
 * submission at the bottom of that same page. No more redirect.
 */
export const managerSidebarNavGroups: NavGroup[] = [
  {
    labelKey: 'nav.groupMain',
    items: [posItem, dashboardItem, ordersItem],
  },
  { labelKey: 'nav.groupOperations', items: [shiftsItem] },
  {
    labelKey: 'nav.groupFinance',
    items: [expensesItem, myCustodyItem],
  },
  // Stage-E — manager can record stock consumption only (no cost-bearing
  // ops). The operations tab auto-disables Adjust/Transfer/Stocktake via
  // the access matrix.
  {
    labelKey: 'nav.groupInventory',
    items: [inventoryOperationsItem],
  },
  // Stage-D — branch HR. Manager approves leaves/loans for own team
  // via access-matrix; attendance view covers daily presence.
  {
    labelKey: 'nav.groupHr',
    items: [attendanceItem, leavesItem, loansItem],
  },
  // Stage-C — AI insights. Manager only unlocks the driver scorecard
  // tab; financial tabs and executive PDF are hidden via access-matrix.
  {
    labelKey: 'nav.groupIntelligence',
    items: [insightsAiItem],
  },
];
