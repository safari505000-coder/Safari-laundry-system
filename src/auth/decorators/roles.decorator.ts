import { SetMetadata } from '@nestjs/common';
import { SafariRole } from '@prisma/client';

export const ROLES_KEY = 'safariRoles';
export const IS_PUBLIC_KEY = 'isPublicEndpoint';
/** When set, OWNER does not bypass @Roles — use for call-center-only operational queues. */
export const NO_OWNER_BYPASS_KEY = 'noOwnerBypass';

export const Roles = (...roles: SafariRole[]) => SetMetadata(ROLES_KEY, roles);
export const Public = (reason: string) => SetMetadata(IS_PUBLIC_KEY, reason);
export const NoOwnerBypass = () => SetMetadata(NO_OWNER_BYPASS_KEY, true);

/** When set on a handler, DRIVER may pass RolesGuard if PermissionsService grants FINANCE_DAILY_POS_SALES_OWN. */
export const DRIVER_FINANCE_DAILY_POS_KEY = 'driverFinanceDailyPosSales';

export const AllowDriverDailyPosSales = () =>
  SetMetadata(DRIVER_FINANCE_DAILY_POS_KEY, true);
