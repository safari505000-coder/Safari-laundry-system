import type { LoginUser } from '@/lib/api';

export const CAN_MANAGE_STAFF = 'can_manage_staff' as const;

/**
 * Temporary frontend capability map.
 * V19.0: OWNER-only staff management (GM is read-only oversight at HTTP layer).
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
