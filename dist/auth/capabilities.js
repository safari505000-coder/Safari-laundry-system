"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppPermission = exports.FINANCE_DAILY_POS_SALES_OWN = exports.CREATE_CUSTOMER = exports.CAN_MANAGE_STAFF = void 0;
exports.roleHasBuiltinCapability = roleHasBuiltinCapability;
const client_1 = require("@prisma/client");
const permissions_enum_1 = require("./permissions/permissions.enum");
Object.defineProperty(exports, "AppPermission", { enumerable: true, get: function () { return permissions_enum_1.AppPermission; } });
const roles_permissions_map_1 = require("./permissions/roles-permissions.map");
exports.CAN_MANAGE_STAFF = 'can_manage_staff';
exports.CREATE_CUSTOMER = 'create_customer';
exports.FINANCE_DAILY_POS_SALES_OWN = 'finance:daily_pos_sales:own';
function roleHasBuiltinCapability(role, capability) {
    if (!role)
        return false;
    if (Object.values(permissions_enum_1.AppPermission).includes(capability)) {
        return (0, roles_permissions_map_1.roleHasAppPermission)(role, capability);
    }
    if (capability === exports.CAN_MANAGE_STAFF) {
        return role === client_1.SafariRole.OWNER;
    }
    if (capability === exports.CREATE_CUSTOMER) {
        return role === client_1.SafariRole.DRIVER || role === client_1.SafariRole.MANAGER;
    }
    if (capability === exports.FINANCE_DAILY_POS_SALES_OWN) {
        return role === client_1.SafariRole.DRIVER;
    }
    return false;
}
//# sourceMappingURL=capabilities.js.map