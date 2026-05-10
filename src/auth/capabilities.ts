import { SafariRole } from '@prisma/client';
import { AppPermission } from './permissions/permissions.enum';
import { roleHasAppPermission } from './permissions/roles-permissions.map';

export const CAN_MANAGE_STAFF = 'can_manage_staff' as const;
export const CREATE_CUSTOMER = 'create_customer' as const;
/** Driver-only: read own completed POS totals for dashboard payment split (see RolesGuard + finance daily-pos-sales). */
export const FINANCE_DAILY_POS_SALES_OWN = 'finance:daily_pos_sales:own' as const;

/**
 * Temporary capability map until dynamic policy assignment is fully rolled out.
 * Current assignment: OWNER only.
 */
export function roleHasBuiltinCapability(
  role: string | null | undefined,
  capability: string,
): boolean {
  if (!role) return false;
  if (Object.values(AppPermission).includes(capability as AppPermission)) {
    return roleHasAppPermission(role, capability as AppPermission);
  }
  if (capability === CAN_MANAGE_STAFF) {
    return role === SafariRole.OWNER;
  }
  if (capability === CREATE_CUSTOMER) {
    return role === SafariRole.DRIVER || role === SafariRole.MANAGER;
  }
  if (capability === FINANCE_DAILY_POS_SALES_OWN) {
    return role === SafariRole.DRIVER;
  }
  return false;
}
