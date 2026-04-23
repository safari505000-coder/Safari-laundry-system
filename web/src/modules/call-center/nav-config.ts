import type { NavGroup } from '@/modules/shared/nav/nav-types';
import { G } from '@/modules/shared/nav/nav-groups';
import {
  allInvoicesItem,
  collectionsItem,
  customersItem,
  driverMonitorItem,
  subscribersItem,
  unpaidInvoicesItem,
  whatsappToolsItem,
} from '@/modules/shared/nav/nav-items';

/**
 * V19.9.5 — CALL_CENTER sidebar on canonical shells.
 *
 * Historic notes kept for discoverability:
 *  - Legacy "Subscriptions List" (/subscriptions catalog) retired;
 *    all subscription flows live on /subscribers.
 *  - `fixedExpensesItem` (rents) was never in CC.
 *  - `loansItem` removed (V19.4) — CC is an operational role, not
 *    an HR self-service surface. Access matrix still revokes
 *    `hr.loans.mine` for CALL_CENTER so deep links to /loans 403.
 *  - `leavesItem` also removed now (V19.9.5) per owner directive;
 *    HR self-service is off every sidebar.
 */
export const callCenterSidebarNavGroups: NavGroup[] = [
  {
    ...G.main,
    items: [customersItem, collectionsItem, subscribersItem, whatsappToolsItem],
  },
  {
    ...G.invoices,
    items: [allInvoicesItem, unpaidInvoicesItem],
  },
  // V19.14 — driver tracking map. Call Center supervises field ops, so
  // seeing which drivers are on shift / where they were last anchored
  // is part of their daily loop. Backend feed is still OWNER-only; the
  // page renders a read-only placeholder for CC until the dedicated
  // endpoint ships (see access-matrix.ts → driverMonitor.view).
  {
    ...G.operations,
    items: [driverMonitorItem],
  },
];
