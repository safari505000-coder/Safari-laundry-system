/**
 * صلاحيات التطبيق — خريطة الصلاحيات والأدوار لطبقة الواجهة الأمامية.
 * Frontend app-permissions — permission constants, role-permission map, and utility helpers.
 * Mirrors the backend AppPermission enum so UI can gate access without additional API calls.
 */
import type { LoginUser, SafariRole } from '@/lib/api';

/**
 * ثوابت صلاحيات التطبيق — مطابقة لـ AppPermission في الخلفية.
 * Frontend AppPermission constants — mirror of the backend enum used for UI gating.
 */
export const AppPermission = {
  VIEW_INVOICES: 'invoices.view',
  CREATE_INVOICE: 'invoices.create',
  UPDATE_INVOICE: 'invoices.update',
  DELETE_INVOICE: 'invoices.delete',
  SHARE_INVOICE: 'invoices.share',
  AUDIT_INVOICE: 'invoices.audit',

  VIEW_REPORTS: 'reports.view',
  VIEW_FINANCIAL_REPORTS: 'reports.financial.view',
  VIEW_CASH: 'cash.view',
  VIEW_DEBTS: 'debts.view',
  VIEW_INVENTORY: 'inventory.view',
  VIEW_PAYROLL: 'payroll.view',
  VIEW_AUDIT_LOGS: 'audit.logs.view',

  VIEW_EXPENSES: 'expenses.view',
  CREATE_EXPENSES: 'expenses.create',
  APPROVE_EXPENSES: 'expenses.approve',

  VIEW_OPERATIONS: 'operations.view',
  UPDATE_OPERATIONS: 'operations.update',
  MANAGE_SETTINGS: 'settings.manage',
  MANAGE_STAFF: 'staff.manage',
  VIEW_CUSTOMERS: 'customers.view',
} as const;

export type AppPermission = (typeof AppPermission)[keyof typeof AppPermission];

export const ROLE_APP_PERMISSIONS: Record<SafariRole, readonly AppPermission[]> = {
  OWNER: Object.values(AppPermission),
  // V19.30 — Read-only oversight: financial + invoice read bundle only (matches backend map).
  GENERAL_MANAGER: [
    AppPermission.VIEW_INVOICES,
    AppPermission.SHARE_INVOICE,
    AppPermission.AUDIT_INVOICE,
    AppPermission.VIEW_REPORTS,
    AppPermission.VIEW_FINANCIAL_REPORTS,
    AppPermission.VIEW_CASH,
    AppPermission.VIEW_DEBTS,
    AppPermission.VIEW_INVENTORY,
    AppPermission.VIEW_PAYROLL,
    AppPermission.VIEW_EXPENSES,
    AppPermission.VIEW_OPERATIONS,
    AppPermission.VIEW_CUSTOMERS,
    AppPermission.VIEW_AUDIT_LOGS,
  ],
  ACCOUNTANT: [
    AppPermission.VIEW_INVOICES,
    AppPermission.SHARE_INVOICE,
    AppPermission.AUDIT_INVOICE,
    AppPermission.VIEW_REPORTS,
    AppPermission.VIEW_FINANCIAL_REPORTS,
    AppPermission.VIEW_CASH,
    AppPermission.VIEW_DEBTS,
    AppPermission.VIEW_INVENTORY,
    AppPermission.VIEW_PAYROLL,
    AppPermission.VIEW_EXPENSES,
    AppPermission.APPROVE_EXPENSES,
    AppPermission.VIEW_OPERATIONS,
    AppPermission.VIEW_CUSTOMERS,
    AppPermission.VIEW_AUDIT_LOGS,
  ],
  MANAGER: [
    AppPermission.VIEW_INVOICES,
    AppPermission.CREATE_INVOICE,
    AppPermission.UPDATE_INVOICE,
    AppPermission.SHARE_INVOICE,
    AppPermission.VIEW_OPERATIONS,
    AppPermission.UPDATE_OPERATIONS,
    AppPermission.VIEW_EXPENSES,
    AppPermission.CREATE_EXPENSES,
    AppPermission.VIEW_REPORTS,
    AppPermission.VIEW_INVENTORY,
    AppPermission.VIEW_CASH,
  ],
  // Matches backend: list expenses is scoped to own rows for drivers.
  DRIVER: [
    AppPermission.VIEW_INVOICES,
    AppPermission.CREATE_INVOICE,
    AppPermission.UPDATE_INVOICE,
    AppPermission.SHARE_INVOICE,
    AppPermission.VIEW_OPERATIONS,
    AppPermission.VIEW_EXPENSES,
    AppPermission.CREATE_EXPENSES,
    AppPermission.VIEW_CASH,
    AppPermission.VIEW_DEBTS,
  ],
  CALL_CENTER: [
    AppPermission.VIEW_INVOICES,
    AppPermission.SHARE_INVOICE,
    AppPermission.VIEW_DEBTS,
    AppPermission.VIEW_CUSTOMERS,
    AppPermission.VIEW_OPERATIONS,
  ],
  CALL_CENTER_SUPERVISOR: [
    AppPermission.VIEW_INVOICES,
    AppPermission.SHARE_INVOICE,
    AppPermission.AUDIT_INVOICE,
    AppPermission.VIEW_REPORTS,
    AppPermission.VIEW_DEBTS,
    AppPermission.VIEW_CUSTOMERS,
    AppPermission.VIEW_OPERATIONS,
  ],
  FLEET_SUPERVISOR: [
    AppPermission.VIEW_EXPENSES,
    AppPermission.CREATE_EXPENSES,
    AppPermission.VIEW_OPERATIONS,
  ],
  SUPERVISOR: [
    AppPermission.VIEW_INVOICES,
    AppPermission.UPDATE_INVOICE,
    AppPermission.SHARE_INVOICE,
    AppPermission.VIEW_REPORTS,
    AppPermission.VIEW_OPERATIONS,
    AppPermission.UPDATE_OPERATIONS,
  ],
  VIEWER: [
    AppPermission.VIEW_INVOICES,
    AppPermission.SHARE_INVOICE,
    AppPermission.VIEW_REPORTS,
  ],
  CUSTOMER: [AppPermission.VIEW_CUSTOMERS],
};

/**
 * يتحقق مما إذا كان المستخدم الحالي يملك صلاحية محددة.
 * Checks whether the logged-in user has a specific AppPermission.
 */
export function hasAppPermission(
  user: LoginUser | null | undefined,
  permission: AppPermission,
): boolean {
  if (!user) return false;
  return (ROLE_APP_PERMISSIONS[user.safariRole] ?? []).includes(permission);
}

/** رسالة تلميح افتراضية للأزرار والعناصر المحظورة. Default tooltip for disabled/restricted UI elements. */
export const NO_PERMISSION_TOOLTIP = 'ليس لديك صلاحية';
