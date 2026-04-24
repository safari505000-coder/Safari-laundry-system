import type { NavGroup } from '@/modules/shared/nav/nav-types';
import { G } from '@/modules/shared/nav/nav-groups';
import {
  allInvoicesItem,
  ccPerformanceItem,
  collectionsItem,
  customersItem,
  driverMonitorItem,
  feedbackInboxItem,
  subscribersItem,
  unpaidInvoicesItem,
} from '@/modules/shared/nav/nav-items';

/**
 * V19.22 — CALL_CENTER_SUPERVISOR mobile/desktop sidebar.
 *
 * The Supervisor now renders the *exact same* three-group shell as
 * the CALL_CENTER agent so that both roles see an identical mobile
 * drawer structure (main / invoices / operations). This avoids the
 * asymmetry where Supervisor used to get a dedicated one-item
 * "Finance" group just for `ccPerformance`, which looked heavier on
 * the mobile drawer and broke parity with the agent.
 *
 * `ccPerformanceItem` is folded into the Invoices group because it
 * is a reporting tool tied to invoice edit/void activity — the
 * audit/reporting companion of the invoice operations surface.
 *
 * The Supervisor's *extra powers* (same-day invoice edit + void +
 * full audit trail) continue to surface as inline row actions on
 * `/all-invoices` and the collections/ledger dialogs, gated by the
 * access matrix — no dedicated sidebar entry is needed.
 *
 * Historic notes retained for discoverability:
 *  - HR self-service removed (V19.9.5) per owner directive.
 *  - `whatsappToolsItem` retired from the sidebar alongside the CC
 *    agent nav (V19.15); WhatsApp outreach is row-driven.
 */
export const callCenterSupervisorSidebarNavGroups: NavGroup[] = [
  {
    ...G.main,
    items: [customersItem, collectionsItem, feedbackInboxItem, subscribersItem],
  },
  {
    ...G.invoices,
    items: [allInvoicesItem, unpaidInvoicesItem, ccPerformanceItem],
  },
  // V19.14 — mirrors CALL_CENTER; supervisor also needs field-ops
  // visibility. Live data is OWNER-only until a dedicated endpoint
  // is wired.
  {
    ...G.operations,
    items: [driverMonitorItem],
  },
];
