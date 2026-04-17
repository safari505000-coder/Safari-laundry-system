"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CREATE_CUSTOMER = exports.CAN_MANAGE_STAFF = void 0;
exports.roleHasBuiltinCapability = roleHasBuiltinCapability;
const client_1 = require("@prisma/client");
exports.CAN_MANAGE_STAFF = 'can_manage_staff';
exports.CREATE_CUSTOMER = 'create_customer';
function roleHasBuiltinCapability(role, capability) {
    if (!role)
        return false;
    if (capability === exports.CAN_MANAGE_STAFF) {
        return role === client_1.SafariRole.OWNER;
    }
    if (capability === exports.CREATE_CUSTOMER) {
        return role === client_1.SafariRole.DRIVER || role === client_1.SafariRole.MANAGER;
    }
    return false;
}
//# sourceMappingURL=capabilities.js.map