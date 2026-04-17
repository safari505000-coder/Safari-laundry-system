import { SafariRole } from '@prisma/client';

export const CAN_MANAGE_STAFF = 'can_manage_staff' as const;
export const CREATE_CUSTOMER = 'create_customer' as const;

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
  if (capability === CREATE_CUSTOMER) {
    return role === SafariRole.DRIVER || role === SafariRole.MANAGER;
  }
  return false;
}
