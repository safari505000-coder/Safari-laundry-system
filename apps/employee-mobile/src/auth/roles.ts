import type { StaffRole } from '@/api/types';

export type MobileAppRole = 'driver' | 'call-center' | 'manager' | 'unsupported';
export type MobileHomeHref =
  | '/(app)/(driver)/(tabs)/tasks'
  | '/(app)/(call-center)'
  | '/(app)/(manager)'
  | '/(app)/unsupported';

const DRIVER_ROLES: StaffRole[] = ['DRIVER'];
const CALL_CENTER_ROLES: StaffRole[] = [
  'CALL_CENTER',
  'CALL_CENTER_SUPERVISOR',
];
const MANAGER_ROLES: StaffRole[] = [
  'MANAGER',
  'OWNER',
  'GENERAL_MANAGER',
];

export function resolveMobileAppRole(role: StaffRole): MobileAppRole {
  if (DRIVER_ROLES.includes(role)) {
    return 'driver';
  }
  if (CALL_CENTER_ROLES.includes(role)) {
    return 'call-center';
  }
  if (MANAGER_ROLES.includes(role)) {
    return 'manager';
  }
  return 'unsupported';
}

export function homeHrefForRole(role: StaffRole): MobileHomeHref {
  switch (resolveMobileAppRole(role)) {
    case 'driver':
      return '/(app)/(driver)/(tabs)/tasks';
    case 'call-center':
      return '/(app)/(call-center)';
    case 'manager':
      return '/(app)/(manager)';
    default:
      return '/(app)/unsupported';
  }
}

export function roleLabelAr(role: StaffRole): string {
  switch (role) {
    case 'DRIVER':
      return 'سائق';
    case 'CALL_CENTER':
      return 'كول سنتر';
    case 'CALL_CENTER_SUPERVISOR':
      return 'مشرف كول سنتر';
    case 'MANAGER':
      return 'مدير';
    case 'OWNER':
      return 'مالك';
    case 'GENERAL_MANAGER':
      return 'مدير عام';
    case 'ACCOUNTANT':
      return 'محاسب';
    case 'FLEET_SUPERVISOR':
      return 'مشرف أسطول';
    default:
      return role;
  }
}
