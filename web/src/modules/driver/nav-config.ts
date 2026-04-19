import type { NavGroup } from '@/modules/shared/nav/nav-types';
import {
  driverFieldExpensesItem,
  driverPendingInvoicesItem,
  myDailySalesItem,
  myDepositsItem,
  posItem,
} from '@/modules/shared/nav/nav-items';

/*
 * Dastur §3 — Driver's Personal Custody ("عهدتي") is now the unified Live
 * Statement. The older "my-cash-custody" link used to duplicate the same
 * totals + invoice list, which confused drivers, so it is intentionally
 * excluded here. The underlying route still exists (see App.tsx) for
 * backwards-compat, it's just no longer surfaced in the sidebar.
 */
export const driverSidebarNavGroups: NavGroup[] = [
  {
    labelKey: 'nav.groupMain',
    items: [
      posItem,
      myDepositsItem,
      myDailySalesItem,
      // V3.8 — Field Collection Tracker (read-only unpaid list).
      driverPendingInvoicesItem,
    ],
  },
  {
    labelKey: 'nav.groupFieldCosts',
    items: [driverFieldExpensesItem],
  },
];
