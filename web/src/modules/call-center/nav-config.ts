import type { NavGroup } from '@/modules/shared/nav/nav-types';
import { G } from '@/modules/shared/nav/nav-groups';
import {
  allInvoicesItem,
  callIncomingItem,
  ccDashboardItem,
  controlTowerItem,
  collectionsItem,
  customersItem,
  driverMonitorItem,
  feedbackInboxItem,
  journalStatementItem,
  outstandingPaymentsItem,
  subscribersItem,
  unpaidInvoicesItem,
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
 *  - `whatsappToolsItem` removed per owner directive ahead of the CC
 *    mobile redesign. WhatsApp outreach still happens per-row in the
 *    Collections page + the statement dialog, so the standalone hub
 *    page stopped earning its sidebar slot. The route itself remains
 *    registered in App.tsx for deep-linking, but no nav points at it.
 */
export const callCenterSidebarNavGroups: NavGroup[] = [
  {
    ...G.main,
    items: [
      // V19.x — single-entry CC dashboard sits at the top: search →
      // 360 with dispatch / risk / audit tabs. Everything below is
      // legacy / specialised (CRM directory, PBX, debt tracker, etc.)
      // and stays for power users until parity with the new dashboard.
      ccDashboardItem,
      controlTowerItem,
      customersItem,
      journalStatementItem,
      callIncomingItem,
      collectionsItem,
      feedbackInboxItem,
      subscribersItem,
    ],
  },
  {
    ...G.invoices,
    // V19.x — Outstanding Payments lives next to the unpaid-invoices
    // tracker so the CC can pivot between per-invoice and per-customer
    // collection workflows without leaving the Invoices group.
    items: [allInvoicesItem, unpaidInvoicesItem, outstandingPaymentsItem],
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
