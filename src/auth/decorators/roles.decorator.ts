import { SetMetadata } from '@nestjs/common';
import { SafariRole } from '@prisma/client';

export const ROLES_KEY = 'safariRoles';

export const Roles = (...roles: SafariRole[]) => SetMetadata(ROLES_KEY, roles);

/** When set on a handler, DRIVER may pass RolesGuard if PermissionsService grants FINANCE_DAILY_POS_SALES_OWN. */
export const DRIVER_FINANCE_DAILY_POS_KEY = 'driverFinanceDailyPosSales';

export const AllowDriverDailyPosSales = () =>
  SetMetadata(DRIVER_FINANCE_DAILY_POS_KEY, true);
