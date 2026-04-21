import type { SafariRole } from '@/lib/api';
import { accountantSidebarNavGroups } from '@/modules/accountant/nav-config';
import { callCenterSidebarNavGroups } from '@/modules/call-center/nav-config';
import { callCenterSupervisorSidebarNavGroups } from '@/modules/call-center-supervisor/nav-config';
import { driverSidebarNavGroups } from '@/modules/driver/nav-config';
import { managerSidebarNavGroups } from '@/modules/manager/nav-config';
import { defaultSidebarNavGroups } from '@/modules/shared/nav/default-nav-config';
import type { NavGroup } from '@/modules/shared/nav/nav-types';

/**
 * Dastur §3.9 — GENERAL_MANAGER now shares the OWNER sidebar (the
 * "Owner's Second Eye" rule). The only difference between the two
 * surfaces lives inside individual `NavItem.roles` arrays:
 *   • `driverMonitorItem.roles = ['OWNER']` → Pulse stays OWNER-only.
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
    case 'MANAGER':
      return managerSidebarNavGroups;
    default:
      return defaultSidebarNavGroups;
  }
}
