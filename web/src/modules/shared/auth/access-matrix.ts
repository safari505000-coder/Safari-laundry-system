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
  // Dastur §2 V19.3 — only DRIVER issues field invoices via POST
  // /orders/quick. Manager uses POS, CC does not create orders.
  'orders.createQuick': ['DRIVER'] satisfies readonly SafariRole[],
  // Dastur §2 — invoice hard-delete is a *last resort* destructive action.
  // Owner keeps it as the master key; the Accountant owns it day-to-day as
  // the book-keeper. Any other role (including GM) is intentionally shut
  // out. To grant a future role, append it here — that is the only edit
  // needed across the codebase.
  'orders.delete': ['OWNER', 'ACCOUNTANT'] satisfies readonly SafariRole[],
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
  // DUSTUR §2 — financial cycle control. Snapshot is readable by everyone who
  // sees the control panel, but the manual override is OWNER master-key only.
  'shiftCycle.view': EXEC_PAIR,
  'shiftCycle.runNow': ['OWNER'] satisfies readonly SafariRole[],

  // ─── Accountant island (shared with exec pair) ────────────────────
  // Pattern: `.view` = OWNER/GM oversight + ACCOUNTANT. `.act` / `.reconcile` /
  // `.stockIn` = accountant-only mutation, so OWNER/GM read but never book.
  'knetAudit.view': withExec('ACCOUNTANT'),
  'knetAudit.reconcile': ['ACCOUNTANT'] satisfies readonly SafariRole[],
  'inventoryReport.view': withExec('ACCOUNTANT'),
  'inventoryReport.stockIn': ['ACCOUNTANT'] satisfies readonly SafariRole[],
  'unifiedLedger.view': withExec('ACCOUNTANT'),
  'reports.view': withExec('ACCOUNTANT'),
  'managerCustodyAging.view': withExec('ACCOUNTANT'),
  'managerCustodyAging.act': ['ACCOUNTANT'] satisfies readonly SafariRole[],
  'staffDebts.view': withExec('ACCOUNTANT'),
  'staffDebts.act': ['ACCOUNTANT'] satisfies readonly SafariRole[],
  'expenseApproval.view': withExec('ACCOUNTANT'),
  'expenseApproval.act': ['ACCOUNTANT'] satisfies readonly SafariRole[],
  'whatsappTools.use': withExec('CALL_CENTER'),
  // Safari Pulse driver radar — OWNER only. Backend guards
  // `/api/finance/driver-monitoring` with @Roles(OWNER), so the UI
  // must stay locked down to match (no more CC/Accountant bypass).
  'driverMonitor.view': ['OWNER'] satisfies readonly SafariRole[],

  // ─── Call centre ──────────────────────────────────────────────────
  // `.view` = exec oversight + CC. `.manage` / `.act` = CC-only mutations
  // where the Dustur makes CC the system of record (reminders, plan
  // management). OWNER keeps manage on the subscriber CRM to support
  // escalations — this mirrors the pre-refactor behaviour so we don't
  // remove a tool the Owner actually uses.
  'customers.view': withExec('CALL_CENTER'),
  'customers.manage': ['OWNER', 'CALL_CENTER'] satisfies readonly SafariRole[],
  'collections.view': withExec('CALL_CENTER'),
  'collections.act': ['CALL_CENTER'] satisfies readonly SafariRole[],
  'subscriptions.view': withExec('CALL_CENTER'),
  'subscriptions.manage': ['CALL_CENTER'] satisfies readonly SafariRole[],
  'subscribers.view': withExec('CALL_CENTER'),
  'subscribers.manage': ['OWNER', 'CALL_CENTER'] satisfies readonly SafariRole[],

  // ─── Branch manager ───────────────────────────────────────────────
  'managerCustody.view': withExec('MANAGER'),
  'managerCustody.act': ['MANAGER'] satisfies readonly SafariRole[],
  'expenses.view': withExec('MANAGER'),
  'expenses.record': ['MANAGER'] satisfies readonly SafariRole[],
  'pos.exitToDashboard': withExec('MANAGER'),

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
