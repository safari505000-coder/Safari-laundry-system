import type { SafariRole } from '@/lib/api';
import { accountantSidebarNavGroups } from '@/modules/accountant/nav-config';
import { callCenterSidebarNavGroups } from '@/modules/call-center/nav-config';
import { callCenterSupervisorSidebarNavGroups } from '@/modules/call-center-supervisor/nav-config';
import { driverSidebarNavGroups } from '@/modules/driver/nav-config';
import { fleetSupervisorSidebarNavGroups } from '@/modules/fleet-supervisor/nav-config';
import { managerSidebarNavGroups } from '@/modules/manager/nav-config';
import { defaultSidebarNavGroups } from '@/modules/shared/nav/default-nav-config';
import type { NavGroup } from '@/modules/shared/nav/nav-types';

/**
 * Dastur §3.9 — GENERAL_MANAGER now shares the OWNER sidebar (the
 * "Owner's Second Eye" rule). The only difference between the two
 * surfaces lives inside individual `NavItem.roles` arrays:
 *   • `driverMonitorItem.roles` now includes OWNER + GM + CC +
 *     CC_SUPERVISOR (V19.14). The map page is visible on all four
 *     sidebars, but live data still flows only for OWNER at the API
 *     layer — other roles see a placeholder until a dedicated feed
 *     is wired. CC/CC_SUP pick the item up through their own module
 *     nav-config files (they don't share this default set).
 *   • Hard-delete actions are gated by their own access-matrix keys.
 * Everything else is identical, so maintaining two configs was pure
 * drift risk. GM falls through to `defaultSidebarNavGroups` here.
 */
export function getSidebarNavGroupsForRole(
  role: SafariRole | undefined,
): NavGroup[] {
  switch (role) {
    case 'DRIVER':
      return driverSidebarNavGroups;
    case 'ACCOUNTANT':
      return accountantSidebarNavGroups;
    case 'CALL_CENTER':
      return callCenterSidebarNavGroups;
    case 'CALL_CENTER_SUPERVISOR':
      return callCenterSupervisorSidebarNavGroups;
    case 'FLEET_SUPERVISOR':
      return fleetSupervisorSidebarNavGroups;
    case 'MANAGER':
      return managerSidebarNavGroups;
    default:
      return defaultSidebarNavGroups;
  }
}
