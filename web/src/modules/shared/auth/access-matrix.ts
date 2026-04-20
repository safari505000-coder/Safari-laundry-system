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

  // ─── Debt Transfer (Dastur §5) ─────────────────────────────────────
  // Departing-driver → replacement-driver debt handover with dual digital
  // signatures. GM and ACCOUNTANT fully operate the workflow (create,
  // finalize, cancel, view). OWNER sees the full history + filtering but
  // MUST NOT initiate, sign, finalize, or cancel — the feature is
  // deliberately kept out of executive oversight's write path so the
  // audit chain always has an independent initiator.
  'debtTransfer.view': [
    'OWNER',
    'GENERAL_MANAGER',
    'ACCOUNTANT',
  ] satisfies readonly SafariRole[],
  'debtTransfer.create': [
    'GENERAL_MANAGER',
    'ACCOUNTANT',
  ] satisfies readonly SafariRole[],
  'debtTransfer.finalize': [
    'GENERAL_MANAGER',
    'ACCOUNTANT',
  ] satisfies readonly SafariRole[],
  'debtTransfer.cancel': [
    'GENERAL_MANAGER',
    'ACCOUNTANT',
  ] satisfies readonly SafariRole[],
  /** Driver (source or target) signs their half of the document. */
  'debtTransfer.sign': ['DRIVER'] satisfies readonly SafariRole[],
  /** Driver-facing inbox of transfers awaiting their signature. */
  'debtTransfer.mine': ['DRIVER'] satisfies readonly SafariRole[],

  'shifts.view': [
    'OWNER',
    'GENERAL_MANAGER',
    'MANAGER',
    'DRIVER',
    'SUPERVISOR',
    'ACCOUNTANT',
    'VIEWER',
  ],
  // Dastur — invoice issuance at POS is strictly field-operator territory:
  // DRIVER (via the field DriverPOS variant) and the branch MANAGER (via
  // the back-office PosPage). OWNER/GENERAL_MANAGER do NOT issue invoices;
  // they supervise through the Financial island + order reports.
  'pos.use': ['MANAGER', 'DRIVER'] satisfies readonly SafariRole[],

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
  // Stage-E — Inventory & Supply Chain writes and oversight screens.
  // View keys get the exec pair (OWNER/GM) + ACCOUNTANT as the custodians of
  // the inventory ledger; MANAGER can consume stock but cannot adjust or
  // transfer cost-bearing balances.
  'inventory.catalog.view': withExec('ACCOUNTANT'),
  'inventory.catalog.manage': ['ACCOUNTANT'] satisfies readonly SafariRole[],
  'inventory.movements.view': withExec('ACCOUNTANT'),
  'inventory.stockOut': ['ACCOUNTANT', 'MANAGER'] satisfies readonly SafariRole[],
  'inventory.adjust': ['ACCOUNTANT'] satisfies readonly SafariRole[],
  'inventory.transfer': ['ACCOUNTANT'] satisfies readonly SafariRole[],
  'inventory.stocktake': ['ACCOUNTANT'] satisfies readonly SafariRole[],
  'inventory.lowStock.view': withExec('ACCOUNTANT'),
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
  // Only MANAGER needs the "Back to Dashboard" shortcut — DRIVER has no
  // dashboard, OWNER/GM never enter POS. Keep this tight so the button
  // never renders for roles that shouldn't see it.
  'pos.exitToDashboard': ['MANAGER'] satisfies readonly SafariRole[],

  // ─── HR Stage-D ───────────────────────────────────────────────────
  // Attendance list/print — OWNER, GM, MANAGER (branch HR), ACCOUNTANT
  // (payroll sign-off). Biometric sync + manual entry are OWNER/GM only.
  'attendance.view': withExec('MANAGER', 'ACCOUNTANT'),
  'attendance.manual': withExec('MANAGER', 'ACCOUNTANT'),
  'attendance.sync': ['OWNER'] satisfies readonly SafariRole[],
  'attendance.biometric': EXEC_PAIR,

  // Leave requests — every role can submit (see `hr.leaves.mine` on the
  // frontend list filter), but only OWNER/GM/MANAGER/ACCOUNTANT can
  // approve or reject.
  'hr.leaves.view': withExec('MANAGER', 'ACCOUNTANT'),
  'hr.leaves.approve': withExec('MANAGER', 'ACCOUNTANT'),
  'hr.leaves.mine': [
    'OWNER',
    'GENERAL_MANAGER',
    'MANAGER',
    'ACCOUNTANT',
    'DRIVER',
    'CALL_CENTER',
    'SUPERVISOR',
    'VIEWER',
  ] satisfies readonly SafariRole[],

  // Employee loans — same approver set as leaves. Drivers and other
  // staff can submit a request for themselves.
  'hr.loans.view': withExec('ACCOUNTANT'),
  'hr.loans.approve': withExec('ACCOUNTANT'),
  'hr.loans.mine': [
    'OWNER',
    'GENERAL_MANAGER',
    'MANAGER',
    'ACCOUNTANT',
    'DRIVER',
    'CALL_CENTER',
    'SUPERVISOR',
    'VIEWER',
  ] satisfies readonly SafariRole[],

  // ─── Stage-C — AI / BI insights ──────────────────────────────────
  // Financial views (cash forecast, anomalies) are shared with the
  // accountant; driver scorecard is a branch-ops KPI so MANAGER also
  // gets it. The weekly executive PDF archive is exec-pair only.
  'insights.view': withExec('ACCOUNTANT', 'MANAGER'),
  'insights.cashForecast.view': withExec('ACCOUNTANT'),
  'insights.anomalies.view': withExec('ACCOUNTANT'),
  'insights.driverScorecard.view': withExec('MANAGER'),
  'insights.executive.view': EXEC_PAIR,

  // ─── Stage-F Cosmetic — Purchase Order workflow ──────────────────
  // Full control: OWNER / GM / Accountant. Branch Manager gets read-
  // only so they see what's arriving before it lands at the branch.
  'purchaseOrders.view': withExec('ACCOUNTANT', 'MANAGER'),
  'purchaseOrders.create': withExec('ACCOUNTANT'),
  'purchaseOrders.send': withExec('ACCOUNTANT'),
  'purchaseOrders.cancel': withExec('ACCOUNTANT'),
  'purchaseOrders.receive': withExec('ACCOUNTANT'),

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
