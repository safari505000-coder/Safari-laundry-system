import type { NavGroup } from '@/modules/shared/nav/nav-types';
import { G } from '@/modules/shared/nav/nav-groups';
import {
  allInvoicesItem,
  ccPerformanceItem,
  collectionsItem,
  customersItem,
  driverMonitorItem,
  subscribersItem,
  unpaidInvoicesItem,
} from '@/modules/shared/nav/nav-items';

/**
 * V19.9.5 — CALL_CENTER_SUPERVISOR sidebar on canonical shells.
 *
 * Mirrors the CALL_CENTER surface (customers, collections,
 * subscribers) and adds the per-agent performance leaderboard
 * inside the Finance group (it's a reporting tool, not an
 * operational one). Invoice edit/void is exercised from row
 * actions on the customer debt list, so no dedicated sidebar entry.
 * HR self-service removed per owner directive.
 *
 * V19.15 — `whatsappToolsItem` retired from the sidebar alongside
 * the CC agent nav; WhatsApp outreach is always driven from a
 * customer/collections row, so the hub page was never the entry
 * point. Route still exists in App.tsx for legacy deep links.
 */
export const callCenterSupervisorSidebarNavGroups: NavGroup[] = [
  {
    ...G.main,
    items: [customersItem, collectionsItem, subscribersItem],
  },
  {
    ...G.invoices,
    items: [allInvoicesItem, unpaidInvoicesItem],
  },
  {
    ...G.finance,
    items: [ccPerformanceItem],
  },
  // V19.14 — mirrors CALL_CENTER; supervisor also needs field-ops
  // visibility. Live data is OWNER-only until a dedicated endpoint
  // is wired.
  {
    ...G.operations,
    items: [driverMonitorItem],
  },
];
