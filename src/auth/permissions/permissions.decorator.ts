import { SetMetadata } from '@nestjs/common';
import { AppPermission } from './permissions.enum';

/** مفتاح الميتاداتا لمصفوفة الصلاحيات المطلوبة على نقطة النهاية. */
export const PERMISSIONS_KEY = 'safariPermissions';

/**
 * مُزيّن الصلاحيات — يُحدد صلاحية أو أكثر مطلوبة للوصول إلى نقطة نهاية.
 * Permissions decorator — declares one or more AppPermissions required to access a route.
 * Evaluated by PermissionsGuard; takes priority over RolesGuard when present.
 */
export const Permissions = (...permissions: AppPermission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
