import type { NavGroup } from '@/modules/shared/nav/nav-types';
import {
  driverFieldExpensesItem,
  driverPendingInvoicesItem,
  leavesItem,
  loansItem,
  myDailySalesItem,
  myDebtTransfersItem,
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
      // Dastur §5 — debt-transfer signature inbox.
      myDebtTransfersItem,
    ],
  },
  {
    labelKey: 'nav.groupFieldCosts',
    items: [driverFieldExpensesItem],
  },
  // Stage-D — Self-service HR. Drivers see only their own leave and
  // loan rows; approver actions are gated inside each page.
  {
    labelKey: 'nav.groupHr',
    items: [leavesItem, loansItem],
  },
];
