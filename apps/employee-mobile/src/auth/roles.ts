import type { Href } from 'expo-router';
import type { StaffRole } from '@/api/types';

export type MobileAppRole =
  | 'driver'
  | 'call-center'
  | 'manager'
  | 'worker'
  | 'unsupported';
export type MobileHomeHref =
  | '/(app)/(driver)/(tabs)/tasks'
  | '/(app)/(call-center)'
  | '/(app)/(manager)'
  | '/(app)/(worker)/tasks'
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
const WORKER_ROLES: StaffRole[] = ['WORKER'];

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
  if (WORKER_ROLES.includes(role)) {
    return 'worker';
  }
  return 'unsupported';
}

export function homeHrefForRole(role: StaffRole): Href {
  switch (resolveMobileAppRole(role)) {
    case 'driver':
      return '/(app)/(driver)/(tabs)/tasks';
    case 'call-center':
      return '/(app)/(call-center)';
    case 'manager':
      return '/(app)/(manager)';
    case 'worker':
      // Route is registered on disk; the typed-routes d.ts regenerates on
      // the next `expo start`, after which this cast is a no-op.
      return '/(app)/(worker)/tasks' as Href;
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
    case 'WORKER':
      return 'عامل إنتاج';
    default:
      return role;
  }
}
