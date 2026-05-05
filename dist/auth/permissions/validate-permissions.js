"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePermissionCoverage = validatePermissionCoverage;
const common_1 = require("@nestjs/common");
const permissions_enum_1 = require("./permissions.enum");
const roles_permissions_map_1 = require("./roles-permissions.map");
const logger = new common_1.Logger('PermissionValidation');
function validatePermissionCoverage() {
    const assigned = new Set(Object.values(roles_permissions_map_1.ROLE_PERMISSIONS).flatMap((permissions) => [...permissions]));
    for (const permission of Object.values(permissions_enum_1.AppPermission)) {
        if (!assigned.has(permission)) {
            logger.warn(JSON.stringify({
                event: 'permission_unassigned',
                traceId: undefined,
                orderId: undefined,
                permission,
            }));
        }
    }
}
//# sourceMappingURL=validate-permissions.js.map