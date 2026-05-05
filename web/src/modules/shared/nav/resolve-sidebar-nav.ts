import type { SafariRole } from '@/lib/api';
import { accountantSidebarNavGroups } from '@/modules/accountant/nav-config';
import { callCenterSidebarNavGroups } from '@/modules/call-center/nav-config';
import { callCenterSupervisorSidebarNavGroups } from '@/modules/call-center-supervisor/nav-config';
import { driverSidebarNavGroups } from '@/modules/driver/nav-config';
import { fleetSupervisorSidebarNavGroups } from '@/modules/fleet-supervisor/nav-config';
import { managerSidebarNavGroups } from '@/modules/manager/nav-config';
import { defaultSidebarNavGroups } from '@/modules/shared/nav/default-nav-config';
import { G } from '@/modules/shared/nav/nav-groups';
import type { NavGroup } from '@/modules/shared/nav/nav-types';
import { customerPortal360Item } from '@/modules/shared/nav/nav-items';
/**
 * Dastur §3.9 — GENERAL_MANAGER shares the OWNER sidebar; HTTP mutations
 * are blocked by `GeneralManagerReadOnlyGuard`. GM falls through to
 * `defaultSidebarNavGroups`. Role-specific islands (driver, accountant, …)
 * use their own nav-config modules.
 */
export function getSidebarNavGroupsForRole(
  role: SafariRole | undefined,
): NavGroup[] {
  switch (role) {
    case 'CUSTOMER':
      return [
        {
          ...G.main,
          items: [customerPortal360Item],
        },
      ];
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
