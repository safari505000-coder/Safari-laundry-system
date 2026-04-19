import type { NavGroup } from '@/modules/shared/nav/nav-types';
import {
  collectionsItem,
  customersItem,
  subscribersItem,
  whatsappToolsItem,
} from '@/modules/shared/nav/nav-items';

// Dastur §5 (V1.5) — the legacy "Subscriptions List" (nav.subscriptions →
// /subscriptions plan catalog) is retired from the Call Center sidebar.
// All subscription actions are now centralized on the Subscribers page
// behind the "Add Subscription" (إضافة اشتراك) button + per-row Renew.
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
];
