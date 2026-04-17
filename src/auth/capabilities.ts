import { SafariRole } from '@prisma/client';

export const CAN_MANAGE_STAFF = 'can_manage_staff' as const;

/**
 * Temporary capability map until dynamic policy assignment is fully rolled out.
 * Current assignment: OWNER only.
 */
export function roleHasBuiltinCapability(
  role: string | null | undefined,
  capability: string,
): boolean {
  if (!role) return false;
  if (capability === CAN_MANAGE_STAFF) {
    return role === SafariRole.OWNER;
  }
  return false;
}
