import type { NavGroup } from '@/modules/shared/nav/nav-types';
import { G } from '@/modules/shared/nav/nav-groups';
import {
  driverFieldExpensesItem,
  driverPendingInvoicesItem,
  myCashReceiptsItem,
  myDailySalesItem,
  myDebtTransfersItem,
  myDepositsItem,
  posItem,
} from '@/modules/shared/nav/nav-items';

/**
 * V19.9.5 — DRIVER sidebar on canonical shells.
 *
 * Dastur §3 still encoded by omission: the legacy "my-cash-custody"
 * route isn't surfaced because it duplicated the unified Live
 * Statement on /my-deposits. Route stays alive in App.tsx for
 * backwards-compat deep links. HR self-service (/leaves, /loans)
 * removed from sidebar per owner directive (V19.9.5).
 */
export const driverSidebarNavGroups: NavGroup[] = [
  {
    ...G.main,
    items: [
      posItem,
      myDepositsItem,
      myCashReceiptsItem,
      myDailySalesItem,
      driverPendingInvoicesItem,
      myDebtTransfersItem,
    ],
  },
  {
    ...G.operations,
    items: [driverFieldExpensesItem],
  },
];
