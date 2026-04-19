import type { LoginUser, SafariRole } from '@/lib/api';

/**
 * Single source of truth for who can see / enter what.
 *
 * Principles:
 *   1. Every guarded route, sidebar entry, and in-page capability check
 *      MUST look up its allowed roles here — never hard-code role
 *      strings in components.
 *   2. The list is exhaustive and explicit. OWNER and GENERAL_MANAGER
 *      are spelled out on every key they can reach; there is NO silent
 *      "master island" bypass any more. If a role is not listed here,
 *      it cannot enter — period.
 *   3. Mutations happen only from this file. Adding a role, revoking a
 *      role, or opening a new screen = exactly one patch here.
 *
 * Naming convention: `<area>.<verb>` (e.g. `inventory.view`,
 * `inventory.stockIn`, `customers.manage`). Keep it stable across
 * front-end and back-end so future Nest guards can mirror the same
 * keys.
 */

/**
 * OWNER + GENERAL_MANAGER see everything as the executive oversight
 * pair. The helper keeps the matrix below readable and guarantees that
 * no key accidentally drops them.
 */
const EXEC_PAIR = ['OWNER', 'GENERAL_MANAGER'] satisfies readonly SafariRole[];

function withExec(...extras: readonly SafariRole[]): readonly SafariRole[] {
  return [...EXEC_PAIR, ...extras];
}

export const ACCESS = {
  // ─── Operations hub (broad access) ────────────────────────────────
  'orders.view': [
    'OWNER',
    'GENERAL_MANAGER',
    'MANAGER',
    'DRIVER',
    'CALL_CENTER',
    'ACCOUNTANT',
    'SUPERVISOR',
    'VIEWER',
  ],
  'shifts.view': [
    'OWNER',
    'GENERAL_MANAGER',
    'MANAGER',
    'DRIVER',
    'SUPERVISOR',
    'ACCOUNTANT',
    'VIEWER',
  ],
  'pos.use': withExec('MANAGER', 'DRIVER'),

  // ─── Executive financial island (OWNER + GM) ──────────────────────
  'financials.view': EXEC_PAIR,
  'financialCycleReport.view': EXEC_PAIR,
  'ownerSerials.manage': EXEC_PAIR,
  'debtRecoveryReport.view': EXEC_PAIR,
  'liveMonitor.view': ['OWNER'] satisfies readonly SafariRole[],
  'payroll.view': EXEC_PAIR,
  'fixedExpenses.view': EXEC_PAIR,
  'branches.manage': EXEC_PAIR,
  'manageItems.edit': EXEC_PAIR,
  'ownerDashboard.view': EXEC_PAIR,

  // ─── Accountant island (shared with exec pair) ────────────────────
  'knetAudit.view': withExec('ACCOUNTANT'),
  'inventoryReport.view': withExec('ACCOUNTANT'),
  // Stock-in is an accountant-only mutation. OWNER/GM oversee via the
  // read-only `inventoryReport.view`. Tightened from the historical
  // "master bypass lets anyone in but the page hides the button".
  'inventoryReport.stockIn': ['ACCOUNTANT'] satisfies readonly SafariRole[],
  'unifiedLedger.view': withExec('ACCOUNTANT'),
  'reports.view': withExec('ACCOUNTANT'),
  'managerCustodyAging.view': withExec('ACCOUNTANT'),
  'staffDebts.view': withExec('ACCOUNTANT'),
  'expenseApproval.view': withExec('ACCOUNTANT'),
  'whatsappTools.use': withExec('CALL_CENTER'),
  'driverMonitor.view': withExec('ACCOUNTANT', 'CALL_CENTER'),

  // ─── Call centre ──────────────────────────────────────────────────
  'customers.view': withExec('CALL_CENTER'),
  'collections.view': withExec('CALL_CENTER'),
  'subscriptions.view': withExec('CALL_CENTER'),
  'subscribers.view': withExec('CALL_CENTER'),

  // ─── Branch manager ───────────────────────────────────────────────
  'managerCustody.view': withExec('MANAGER'),
  'expenses.view': withExec('MANAGER'),

  // ─── Driver personal island ───────────────────────────────────────
  'myDeposits.view': withExec('DRIVER'),
  'myDailySales.view': withExec('DRIVER'),
  'myFieldExpenses.view': withExec('DRIVER'),
  'driverPendingInvoices.view': withExec('DRIVER'),
} as const satisfies Record<string, readonly SafariRole[]>;

export type AccessKey = keyof typeof ACCESS;

/**
 * Get the list of roles allowed on a given key. Returned as a mutable
 * `SafariRole[]` so it slots straight into existing `RequireRoles
 * roles={…}` props without a `readonly` complaint.
 */
export function rolesFor(key: AccessKey): SafariRole[] {
  return [...ACCESS[key]];
}

/**
 * Test whether the given user has the capability identified by `key`.
 *
 * `null`/`undefined` user = unauthenticated = no access.
 */
export function can(
  user: Pick<LoginUser, 'safariRole'> | null | undefined,
  key: AccessKey,
): boolean {
  if (!user) return false;
  return (ACCESS[key] as readonly SafariRole[]).includes(user.safariRole);
}
