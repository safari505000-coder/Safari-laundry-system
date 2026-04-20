import type { NavGroup } from '@/modules/shared/nav/nav-types';
import {
  collectionsItem,
  customersItem,
  leavesItem,
  subscribersItem,
  whatsappToolsItem,
} from '@/modules/shared/nav/nav-items';

// Dastur §5 (V1.5) — the legacy "Subscriptions List" (nav.subscriptions →
// /subscriptions plan catalog) is retired from the Call Center sidebar.
// All subscription actions are now centralized on the Subscribers page
// behind the "Add Subscription" (إضافة اشتراك) button + per-row Renew.
//
// V19.4 — point #6 of the CC pack: "إزالة الإيجارات والسلف من الكول سنتر".
// `fixedExpensesItem` (rents) was never in the CC sidebar. `loansItem`
// was here as self-service HR but is now removed per product call: the
// call-centre agent is an operational front-line role, not an HR self-
// service surface. Access is also revoked at the matrix level
// (`hr.loans.mine` no longer lists `CALL_CENTER`) so deep links to
// `/loans` return 403 instead of quietly working.
//
// `leavesItem` stays — leave requests are still a legitimate CC ask
// because schedules change per day; only loans/rents were deprecated.
//
// `driverMonitorItem` is OWNER-only (`access-matrix.driverMonitor.view`),
// so it is not listed here — the role filter would strip it regardless.
export const callCenterSidebarNavGroups: NavGroup[] = [
  {
    labelKey: 'nav.groupMain',
    items: [
      customersItem,
      collectionsItem,
      subscribersItem,
      whatsappToolsItem,
    ],
  },
  // Stage-D — Self-service HR for call-center staff (leaves only).
  {
    labelKey: 'nav.groupHr',
    items: [leavesItem],
  },
];
