import type { NavGroup } from '@/modules/shared/nav/nav-types';
import {
  dashboardItem,
  expensesItem,
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
];
