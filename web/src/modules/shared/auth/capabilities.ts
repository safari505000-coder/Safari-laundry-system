import type { LoginUser } from '@/lib/api';

export const CAN_MANAGE_STAFF = 'can_manage_staff' as const;

/**
 * Temporary frontend capability map.
 * Current policy: only OWNER has can_manage_staff.
 */
export function hasCapability(
  user: LoginUser | null | undefined,
  capability: string,
): boolean {
  if (!user) return false;
  if (capability === CAN_MANAGE_STAFF) {
    return user.safariRole === 'OWNER';
  }
  return false;
}
