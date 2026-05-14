import { Logger } from '@nestjs/common';
import { AppPermission } from './permissions.enum';
import { ROLE_PERMISSIONS } from './roles-permissions.map';

const logger = new Logger('PermissionValidation');

/**
 * يتحقق عند بدء التشغيل من أن كل AppPermission مُعيَّنة لدور واحد على الأقل.
 * Startup validation — warns when any AppPermission is not assigned to at least one role.
 */
export function validatePermissionCoverage(): void {
  const assigned = new Set(
    Object.values(ROLE_PERMISSIONS).flatMap((permissions) => [...permissions]),
  );

  for (const permission of Object.values(AppPermission)) {
    if (!assigned.has(permission)) {
      logger.warn(
        JSON.stringify({
          event: 'permission_unassigned',
          traceId: undefined,
          orderId: undefined,
          permission,
        }),
      );
    }
  }
}
