import type { NavGroup } from '@/modules/shared/nav/nav-types';
import { G } from '@/modules/shared/nav/nav-groups';
import {
  allInvoicesItem,
  ccPerformanceItem,
  collectionsItem,
  customersItem,
  subscribersItem,
  whatsappToolsItem,
} from '@/modules/shared/nav/nav-items';

/**
 * V19.9.5 — CALL_CENTER_SUPERVISOR sidebar on canonical shells.
 *
 * Mirrors the CALL_CENTER surface (customers, collections,
 * subscribers, WhatsApp tools) and adds the per-agent performance
 * leaderboard inside the Finance group (it's a reporting tool, not
 * an operational one). Invoice edit/void is exercised from row
 * actions on the customer debt list, so no dedicated sidebar entry.
 * HR self-service removed per owner directive.
 */
export const callCenterSupervisorSidebarNavGroups: NavGroup[] = [
  {
    ...G.main,
    items: [customersItem, collectionsItem, subscribersItem, whatsappToolsItem],
  },
  {
    ...G.invoices,
    items: [allInvoicesItem],
  },
  {
    ...G.finance,
    items: [ccPerformanceItem],
  },
];
