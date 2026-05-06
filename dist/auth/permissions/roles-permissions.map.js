"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROLE_PERMISSIONS = void 0;
exports.permissionsForRole = permissionsForRole;
exports.roleHasAppPermission = roleHasAppPermission;
const client_1 = require("@prisma/client");
const permissions_enum_1 = require("./permissions.enum");
const invoiceRead = [
    permissions_enum_1.AppPermission.VIEW_INVOICES,
    permissions_enum_1.AppPermission.SHARE_INVOICE,
];
const financialOversight = [
    permissions_enum_1.AppPermission.VIEW_REPORTS,
    permissions_enum_1.AppPermission.VIEW_FINANCIAL_REPORTS,
    permissions_enum_1.AppPermission.VIEW_CASH,
    permissions_enum_1.AppPermission.VIEW_DEBTS,
    permissions_enum_1.AppPermission.VIEW_INVENTORY,
    permissions_enum_1.AppPermission.VIEW_PAYROLL,
    permissions_enum_1.AppPermission.VIEW_EXPENSES,
    permissions_enum_1.AppPermission.AUDIT_INVOICE,
    permissions_enum_1.AppPermission.VIEW_AUDIT_LOGS,
];
exports.ROLE_PERMISSIONS = {
    [client_1.SafariRole.OWNER]: Object.values(permissions_enum_1.AppPermission),
    [client_1.SafariRole.GENERAL_MANAGER]: [
        ...invoiceRead,
        ...financialOversight,
        permissions_enum_1.AppPermission.VIEW_CUSTOMERS,
        permissions_enum_1.AppPermission.VIEW_DISPATCH,
        permissions_enum_1.AppPermission.MANAGE_USERS,
    ],
    [client_1.SafariRole.ACCOUNTANT]: [
        ...invoiceRead,
        ...financialOversight,
        permissions_enum_1.AppPermission.APPROVE_EXPENSES,
        permissions_enum_1.AppPermission.VIEW_CUSTOMERS,
        permissions_enum_1.AppPermission.VIEW_DISPATCH,
    ],
    [client_1.SafariRole.MANAGER]: [
        ...invoiceRead,
        permissions_enum_1.AppPermission.VIEW_REPORTS,
        permissions_enum_1.AppPermission.VIEW_CASH,
        permissions_enum_1.AppPermission.VIEW_DEBTS,
        permissions_enum_1.AppPermission.VIEW_INVENTORY,
        permissions_enum_1.AppPermission.VIEW_EXPENSES,
        permissions_enum_1.AppPermission.CREATE_INVOICE,
        permissions_enum_1.AppPermission.UPDATE_INVOICE,
        permissions_enum_1.AppPermission.CREATE_EXPENSES,
        permissions_enum_1.AppPermission.CREATE_OPERATIONAL_DATA,
        permissions_enum_1.AppPermission.UPDATE_OPERATIONAL_DATA,
        permissions_enum_1.AppPermission.VIEW_DISPATCH,
        permissions_enum_1.AppPermission.MANAGE_USERS,
    ],
    [client_1.SafariRole.DRIVER]: [
        ...invoiceRead,
        permissions_enum_1.AppPermission.CREATE_INVOICE,
        permissions_enum_1.AppPermission.UPDATE_INVOICE,
        permissions_enum_1.AppPermission.VIEW_EXPENSES,
        permissions_enum_1.AppPermission.CREATE_EXPENSES,
        permissions_enum_1.AppPermission.CREATE_OPERATIONAL_DATA,
        permissions_enum_1.AppPermission.UPDATE_OPERATIONAL_DATA,
        permissions_enum_1.AppPermission.VIEW_DISPATCH,
    ],
    [client_1.SafariRole.CALL_CENTER]: [
        ...invoiceRead,
        permissions_enum_1.AppPermission.VIEW_DEBTS,
        permissions_enum_1.AppPermission.VIEW_CUSTOMERS,
        permissions_enum_1.AppPermission.MANAGE_DISPATCH,
        permissions_enum_1.AppPermission.VIEW_DISPATCH,
        permissions_enum_1.AppPermission.MANAGE_CUSTOMER_BLOCK,
    ],
    [client_1.SafariRole.CALL_CENTER_SUPERVISOR]: [
        ...invoiceRead,
        permissions_enum_1.AppPermission.VIEW_DEBTS,
        permissions_enum_1.AppPermission.VIEW_CUSTOMERS,
        permissions_enum_1.AppPermission.VIEW_REPORTS,
        permissions_enum_1.AppPermission.EDIT_INVOICE_AUDIT,
        permissions_enum_1.AppPermission.VOID_INVOICE_AUDIT,
        permissions_enum_1.AppPermission.MANAGE_DISPATCH,
        permissions_enum_1.AppPermission.VIEW_DISPATCH,
        permissions_enum_1.AppPermission.MANAGE_CUSTOMER_BLOCK,
    ],
    [client_1.SafariRole.FLEET_SUPERVISOR]: [
        permissions_enum_1.AppPermission.VIEW_EXPENSES,
        permissions_enum_1.AppPermission.CREATE_EXPENSES,
    ],
    [client_1.SafariRole.SUPERVISOR]: [
        ...invoiceRead,
        permissions_enum_1.AppPermission.VIEW_REPORTS,
        permissions_enum_1.AppPermission.VIEW_CUSTOMERS,
        permissions_enum_1.AppPermission.UPDATE_INVOICE,
        permissions_enum_1.AppPermission.UPDATE_OPERATIONAL_DATA,
        permissions_enum_1.AppPermission.MANAGE_USERS,
    ],
    [client_1.SafariRole.VIEWER]: [
        ...invoiceRead,
        permissions_enum_1.AppPermission.VIEW_REPORTS,
        permissions_enum_1.AppPermission.VIEW_CUSTOMERS,
    ],
    [client_1.SafariRole.CUSTOMER]: [permissions_enum_1.AppPermission.VIEW_CUSTOMERS],
    [client_1.SafariRole.WORKER]: [],
};
function permissionsForRole(role) {
    const key = typeof role === 'string' && role.trim() ? role.trim().toUpperCase() : '';
    if (!key || !(key in exports.ROLE_PERMISSIONS)) {
        return [];
    }
    return exports.ROLE_PERMISSIONS[key];
}
function roleHasAppPermission(role, permission) {
    return permissionsForRole(role).includes(permission);
}
//# sourceMappingURL=roles-permissions.map.js.map