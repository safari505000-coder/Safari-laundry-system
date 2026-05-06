export enum AppPermission {
  VIEW_INVOICES = 'invoices.view',
  CREATE_INVOICE = 'invoices.create',
  UPDATE_INVOICE = 'invoices.update',
  DELETE_INVOICE = 'invoices.delete',
  SHARE_INVOICE = 'invoices.share',
  AUDIT_INVOICE = 'invoices.audit',
  EDIT_INVOICE_AUDIT = 'invoices.audit.edit',
  VOID_INVOICE_AUDIT = 'invoices.audit.void',

  VIEW_REPORTS = 'reports.view',
  VIEW_FINANCIAL_REPORTS = 'reports.financial.view',
  VIEW_CASH = 'cash.view',
  VIEW_DEBTS = 'debts.view',
  /** Customer directory / CRM reads (`GET /customers`, profile, PBX resolve). */
  VIEW_CUSTOMERS = 'customers.view',
  VIEW_INVENTORY = 'inventory.view',
  VIEW_PAYROLL = 'payroll.view',

  VIEW_AUDIT_LOGS = 'audit.logs.view',

  CREATE_OPERATIONAL_DATA = 'operations.create',
  UPDATE_OPERATIONAL_DATA = 'operations.update',
  DELETE_OPERATIONAL_DATA = 'operations.delete',

  VIEW_EXPENSES = 'expenses.view',
  CREATE_EXPENSES = 'expenses.create',
  APPROVE_EXPENSES = 'expenses.approve',

  // V19.x — Call-Center → Driver dispatch module.
  // MANAGE_DISPATCH       → create / list / read dispatches.
  // VIEW_DISPATCH         → read-only listing (driver + supervisor reads).
  // MANAGE_CUSTOMER_BLOCK → manual block / unblock customer
  //                         (supplements the auto-block path that the
  //                         finance layer already runs on debt thresholds).
  MANAGE_DISPATCH = 'dispatch.manage',
  VIEW_DISPATCH = 'dispatch.view',
  MANAGE_CUSTOMER_BLOCK = 'customers.block.manage',

  /** Reset staff passwords (single/bulk); does NOT grant unrelated HR edits. */
  MANAGE_USERS = 'users.manage',
}
