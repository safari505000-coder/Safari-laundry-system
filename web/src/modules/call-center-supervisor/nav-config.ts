import type { NavGroup } from '@/modules/shared/nav/nav-types';
import {
  ccPerformanceItem,
  collectionsItem,
  customersItem,
  leavesItem,
  subscribersItem,
  whatsappToolsItem,
} from '@/modules/shared/nav/nav-items';

/**
 * V19.9 — Call-Center Supervisor sidebar.
 *
 * Mirrors the CALL_CENTER surface (customers, collections, subscribers,
 * WhatsApp tools) and adds a dedicated Reports group with the per-agent
 * performance leaderboard. Invoice edit/void itself is exercised from
 * row actions on the customer debt list, so it deliberately has no
 * sidebar entry.
 */
export const callCenterSupervisorSidebarNavGroups: NavGroup[] = [
  {
    labelKey: 'nav.groupMain',
    items: [
      customersItem,
      collectionsItem,
      subscribersItem,
      whatsappToolsItem,
    ],
  },
  {
    labelKey: 'nav.groupIntelligence',
    items: [ccPerformanceItem],
  },
  {
    labelKey: 'nav.groupHr',
    items: [leavesItem],
  },
];
