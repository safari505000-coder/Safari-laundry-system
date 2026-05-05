import { SafariRole } from '@prisma/client';
import { AppPermission } from './permissions.enum';

const invoiceRead = [
  AppPermission.VIEW_INVOICES,
  AppPermission.SHARE_INVOICE,
] as const;

const financialOversight = [
  AppPermission.VIEW_REPORTS,
  AppPermission.VIEW_FINANCIAL_REPORTS,
  AppPermission.VIEW_CASH,
  AppPermission.VIEW_DEBTS,
  AppPermission.VIEW_INVENTORY,
  AppPermission.VIEW_PAYROLL,
  AppPermission.VIEW_EXPENSES,
  AppPermission.AUDIT_INVOICE,
  AppPermission.VIEW_AUDIT_LOGS,
] as const;

export const ROLE_PERMISSIONS = {
  [SafariRole.OWNER]: Object.values(AppPermission),
  // V19.30 — Read-only oversight: same financial read surface as ACCOUNTANT’s
  // permission map, no invoice/expense/operational writes (enforced here +
  // GeneralManagerReadOnlyGuard for non-GET HTTP).
  [SafariRole.GENERAL_MANAGER]: [
    ...invoiceRead,
    ...financialOversight,
    AppPermission.VIEW_CUSTOMERS,
    AppPermission.VIEW_DISPATCH,
  ],
  [SafariRole.ACCOUNTANT]: [
    ...invoiceRead,
    ...financialOversight,
    AppPermission.APPROVE_EXPENSES,
    AppPermission.VIEW_CUSTOMERS,
    AppPermission.VIEW_DISPATCH,
  ],
  [SafariRole.MANAGER]: [
    ...invoiceRead,
    AppPermission.VIEW_REPORTS,
    AppPermission.VIEW_CASH,
    AppPermission.VIEW_DEBTS,
    AppPermission.VIEW_INVENTORY,
    AppPermission.VIEW_EXPENSES,
    AppPermission.CREATE_INVOICE,
    AppPermission.UPDATE_INVOICE,
    AppPermission.CREATE_EXPENSES,
    AppPermission.CREATE_OPERATIONAL_DATA,
    AppPermission.UPDATE_OPERATIONAL_DATA,
    AppPermission.VIEW_DISPATCH,
  ],
  // DRIVER may GET /expenses only for own rows (listForUser scopes by recordedById).
  [SafariRole.DRIVER]: [
    ...invoiceRead,
    AppPermission.CREATE_INVOICE,
    AppPermission.UPDATE_INVOICE,
    AppPermission.VIEW_EXPENSES,
    AppPermission.CREATE_EXPENSES,
    AppPermission.CREATE_OPERATIONAL_DATA,
    AppPermission.UPDATE_OPERATIONAL_DATA,
    AppPermission.VIEW_DISPATCH,
  ],
  [SafariRole.CALL_CENTER]: [
    ...invoiceRead,
    AppPermission.VIEW_DEBTS,
    AppPermission.VIEW_CUSTOMERS,
    AppPermission.MANAGE_DISPATCH,
    AppPermission.VIEW_DISPATCH,
    AppPermission.MANAGE_CUSTOMER_BLOCK,
  ],
  [SafariRole.CALL_CENTER_SUPERVISOR]: [
    ...invoiceRead,
    AppPermission.VIEW_DEBTS,
    AppPermission.VIEW_CUSTOMERS,
    AppPermission.VIEW_REPORTS,
    AppPermission.EDIT_INVOICE_AUDIT,
    AppPermission.VOID_INVOICE_AUDIT,
    AppPermission.MANAGE_DISPATCH,
    AppPermission.VIEW_DISPATCH,
    AppPermission.MANAGE_CUSTOMER_BLOCK,
  ],
  [SafariRole.FLEET_SUPERVISOR]: [
    AppPermission.VIEW_EXPENSES,
    AppPermission.CREATE_EXPENSES,
  ],
  [SafariRole.SUPERVISOR]: [
    ...invoiceRead,
    AppPermission.VIEW_REPORTS,
    AppPermission.VIEW_CUSTOMERS,
    AppPermission.UPDATE_INVOICE,
    AppPermission.UPDATE_OPERATIONAL_DATA,
  ],
  [SafariRole.VIEWER]: [
    ...invoiceRead,
    AppPermission.VIEW_REPORTS,
    AppPermission.VIEW_CUSTOMERS,
  ],
  [SafariRole.CUSTOMER]: [AppPermission.VIEW_CUSTOMERS],
  [SafariRole.WORKER]: [],
} satisfies Record<SafariRole, readonly AppPermission[]>;

export function permissionsForRole(
  role: string | null | undefined,
): readonly AppPermission[] {
  const key =
    typeof role === 'string' && role.trim() ? role.trim().toUpperCase() : '';
  if (!key || !(key in ROLE_PERMISSIONS)) {
    return [];
  }
  return ROLE_PERMISSIONS[key as SafariRole];
}

export function roleHasAppPermission(
  role: string | null | undefined,
  permission: AppPermission,
): boolean {
  return permissionsForRole(role).includes(permission);
}
