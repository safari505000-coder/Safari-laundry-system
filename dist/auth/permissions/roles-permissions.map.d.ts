import { AppPermission } from './permissions.enum';
export declare const ROLE_PERMISSIONS: {
    OWNER: AppPermission[];
    GENERAL_MANAGER: (AppPermission.VIEW_INVOICES | AppPermission.SHARE_INVOICE | AppPermission.AUDIT_INVOICE | AppPermission.VIEW_REPORTS | AppPermission.VIEW_FINANCIAL_REPORTS | AppPermission.VIEW_CASH | AppPermission.VIEW_DEBTS | AppPermission.VIEW_CUSTOMERS | AppPermission.VIEW_INVENTORY | AppPermission.VIEW_PAYROLL | AppPermission.VIEW_AUDIT_LOGS | AppPermission.VIEW_EXPENSES | AppPermission.VIEW_DISPATCH)[];
    ACCOUNTANT: (AppPermission.VIEW_INVOICES | AppPermission.SHARE_INVOICE | AppPermission.AUDIT_INVOICE | AppPermission.VIEW_REPORTS | AppPermission.VIEW_FINANCIAL_REPORTS | AppPermission.VIEW_CASH | AppPermission.VIEW_DEBTS | AppPermission.VIEW_CUSTOMERS | AppPermission.VIEW_INVENTORY | AppPermission.VIEW_PAYROLL | AppPermission.VIEW_AUDIT_LOGS | AppPermission.VIEW_EXPENSES | AppPermission.APPROVE_EXPENSES | AppPermission.VIEW_DISPATCH)[];
    MANAGER: (AppPermission.VIEW_INVOICES | AppPermission.CREATE_INVOICE | AppPermission.UPDATE_INVOICE | AppPermission.SHARE_INVOICE | AppPermission.VIEW_REPORTS | AppPermission.VIEW_CASH | AppPermission.VIEW_DEBTS | AppPermission.VIEW_INVENTORY | AppPermission.CREATE_OPERATIONAL_DATA | AppPermission.UPDATE_OPERATIONAL_DATA | AppPermission.VIEW_EXPENSES | AppPermission.CREATE_EXPENSES | AppPermission.VIEW_DISPATCH)[];
    DRIVER: (AppPermission.VIEW_INVOICES | AppPermission.CREATE_INVOICE | AppPermission.UPDATE_INVOICE | AppPermission.SHARE_INVOICE | AppPermission.CREATE_OPERATIONAL_DATA | AppPermission.UPDATE_OPERATIONAL_DATA | AppPermission.VIEW_EXPENSES | AppPermission.CREATE_EXPENSES | AppPermission.VIEW_DISPATCH)[];
    CALL_CENTER: (AppPermission.VIEW_INVOICES | AppPermission.SHARE_INVOICE | AppPermission.VIEW_DEBTS | AppPermission.VIEW_CUSTOMERS | AppPermission.MANAGE_DISPATCH | AppPermission.VIEW_DISPATCH | AppPermission.MANAGE_CUSTOMER_BLOCK)[];
    CALL_CENTER_SUPERVISOR: (AppPermission.VIEW_INVOICES | AppPermission.SHARE_INVOICE | AppPermission.EDIT_INVOICE_AUDIT | AppPermission.VOID_INVOICE_AUDIT | AppPermission.VIEW_REPORTS | AppPermission.VIEW_DEBTS | AppPermission.VIEW_CUSTOMERS | AppPermission.MANAGE_DISPATCH | AppPermission.VIEW_DISPATCH | AppPermission.MANAGE_CUSTOMER_BLOCK)[];
    FLEET_SUPERVISOR: (AppPermission.VIEW_EXPENSES | AppPermission.CREATE_EXPENSES)[];
    SUPERVISOR: (AppPermission.VIEW_INVOICES | AppPermission.UPDATE_INVOICE | AppPermission.SHARE_INVOICE | AppPermission.VIEW_REPORTS | AppPermission.VIEW_CUSTOMERS | AppPermission.UPDATE_OPERATIONAL_DATA)[];
    VIEWER: (AppPermission.VIEW_INVOICES | AppPermission.SHARE_INVOICE | AppPermission.VIEW_REPORTS | AppPermission.VIEW_CUSTOMERS)[];
    CUSTOMER: AppPermission.VIEW_CUSTOMERS[];
    WORKER: never[];
};
export declare function permissionsForRole(role: string | null | undefined): readonly AppPermission[];
export declare function roleHasAppPermission(role: string | null | undefined, permission: AppPermission): boolean;
