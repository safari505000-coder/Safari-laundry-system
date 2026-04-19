import type { SafariRole } from '@/lib/api';
import { accountantSidebarNavGroups } from '@/modules/accountant/nav-config';
import { callCenterSidebarNavGroups } from '@/modules/call-center/nav-config';
import { driverSidebarNavGroups } from '@/modules/driver/nav-config';
import { generalManagerSidebarNavGroups } from '@/modules/general-manager/nav-config';
import { managerSidebarNavGroups } from '@/modules/manager/nav-config';
import { defaultSidebarNavGroups } from '@/modules/shared/nav/default-nav-config';
import type { NavGroup } from '@/modules/shared/nav/nav-types';

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
    case 'MANAGER':
      return managerSidebarNavGroups;
    case 'GENERAL_MANAGER':
      return generalManagerSidebarNavGroups;
    default:
      return defaultSidebarNavGroups;
  }
}
