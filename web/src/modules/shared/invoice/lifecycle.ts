/**
 * دستور الفاتورة — Invoice Lifecycle (single source of truth).
 *
 * The Constitution defines four logical states an invoice flows through:
 *
 *   UNPAID → PAID_TO_DRIVER → PAID_TO_BRANCH_MANAGER → SETTLED
 *
 * The persistence layer today stores only three `CashStatus` values
 * (UNPAID, PAID_TO_DRIVER, HANDED_OVER_TO_OFFICE) on `Order`; the
 * four-state Constitution is derived from those values plus optional
 * manager-custody verification metadata.
 *
 * SCOPE — this module changes BUSINESS LOGIC ONLY:
 *   - no UI changes
 *   - no data / calculation / number changes
 *   - no new persisted fields
 *   - no migration
 *
 * It only centralises:
 *   1. WHICH logical state an invoice is in
 *   2. WHEN an invoice appears on a given screen (visibility)
 *   3. WHERE it transitions when its backing cashStatus flips
 *
 * Every screen that currently does an inline `cashStatus === '…'`
 * filter must route through here instead. Screens that merely render
 * the raw `cashStatus` label are left untouched so their rendered
 * text does not change.
 */

/** The four constitutional states. */
export type InvoiceLifecycleState =
  | 'UNPAID'
  | 'PAID_TO_DRIVER'
  | 'PAID_TO_BRANCH_MANAGER'
  | 'SETTLED';

/**
 * Minimum fields required to derive the lifecycle state.
 *
 * `cashStatus` is typed as `string` (not a literal union) to match the
 * existing `OrderRow.cashStatus: string` contract in `@/lib/api`, so we
 * can consume current rows without any shape change.
 *
 * `managerCustodyVerifiedAt` is optional: today the frontend
 * `OrderRow` does NOT carry it, so any order with
 * `cashStatus === 'HANDED_OVER_TO_OFFICE'` defaults to
 * `PAID_TO_BRANCH_MANAGER`. When/if the backend later enriches
 * `OrderRow` with verification metadata, passing it through will flip
 * such rows to `SETTLED` automatically — no consumer change required.
 */
export type LifecycleInput = {
  status?: string | null;
  cashStatus: string;
  managerCustodyVerifiedAt?: string | Date | null;
};

/**
 * Derive the Constitution state from an order's persisted fields.
 *
 * Mapping:
 *   cashStatus = UNPAID                    → UNPAID
 *   cashStatus = PAID_TO_DRIVER            → PAID_TO_DRIVER
 *   cashStatus = HANDED_OVER_TO_OFFICE
 *     AND managerCustodyVerifiedAt is set  → SETTLED
 *   cashStatus = HANDED_OVER_TO_OFFICE
 *     AND no verification seen yet         → PAID_TO_BRANCH_MANAGER
 *   anything else (unknown backend value)  → SETTLED (terminal fallback)
 */
export function deriveLifecycle(order: LifecycleInput): InvoiceLifecycleState {
  switch (order.cashStatus) {
    case 'UNPAID':
      return 'UNPAID';
    case 'PAID_TO_DRIVER':
      return 'PAID_TO_DRIVER';
    case 'HANDED_OVER_TO_OFFICE':
      return order.managerCustodyVerifiedAt ? 'SETTLED' : 'PAID_TO_BRANCH_MANAGER';
    default:
      return 'SETTLED';
  }
}

/**
 * Named visibility scopes — each scope is the list of Constitution
 * states that should appear on that screen/surface.
 *
 * Adding a screen? Add a scope here, then call `isVisibleOn(order,
 * '<scope>')` from the screen. DO NOT write another `cashStatus ===
 * '…'` check anywhere in the app.
 */
export const VISIBILITY = {
  /** Driver island — "كشف المتابعة الميدانية" (unpaid invoices in the driver's bag). */
  driverPendingInvoices: ['UNPAID'],

  /** Driver island — "ودائعي" (money collected, not yet handed to manager). */
  driverMyDeposits: ['PAID_TO_DRIVER'],

  /** Driver island — legacy "عهدتي النقدية" (mirrors driverMyDeposits). */
  driverMyCashCustody: ['PAID_TO_DRIVER'],

  /** Manager island — driver-handover queue (cash still in the manager's safe). */
  managerCustody: ['PAID_TO_DRIVER'],

  /** Manager island — bundles handed to the manager, awaiting bank deposit. */
  managerPendingDeposits: ['PAID_TO_BRANCH_MANAGER'],

  /** Accountant island — deposits waiting for accountant verification. */
  accountantPendingVerification: ['PAID_TO_BRANCH_MANAGER'],

  /** Call-centre debt recovery tracker. */
  callCenterDebt: ['UNPAID'],

  /** Finalised invoices (read-only archives / completed ledger views). */
  settledArchive: ['SETTLED'],

  /** Orders data hub — shows the full lifecycle (no hiding). */
  ordersHub: [
    'UNPAID',
    'PAID_TO_DRIVER',
    'PAID_TO_BRANCH_MANAGER',
    'SETTLED',
  ],
} as const satisfies Record<string, readonly InvoiceLifecycleState[]>;

export type VisibilityScope = keyof typeof VISIBILITY;

/** Does this order belong on the given screen? */
export function isVisibleOn(
  order: LifecycleInput,
  scope: VisibilityScope,
): boolean {
  const allowed: readonly InvoiceLifecycleState[] = VISIBILITY[scope];
  return allowed.includes(deriveLifecycle(order));
}

/** Keep only the orders that belong on the given screen. */
export function filterByScope<T extends LifecycleInput>(
  orders: readonly T[] | null | undefined,
  scope: VisibilityScope,
): T[] {
  if (!orders) return [];
  return orders.filter((o) => isVisibleOn(o, scope));
}
