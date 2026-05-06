import type {
  CollectionUnpaidOnlineRow,
} from '@/lib/api';
import type { OutstandingRow } from '@/modules/call-center/outstanding/api/outstanding-api';

/**
 * UI-only grouping utilities for the Collections Report.
 *
 * STRICT FINANCIAL CONTRACT (DO NOT BREAK):
 *  - We never recompute the canonical AR total. The KPI strip always
 *    reads `OutstandingResponse.totalDueKd` directly from the API.
 *  - These helpers ONLY group already-fetched rows for display
 *    purposes — per-driver / per-branch breakdowns are derived
 *    sub-views, clearly distinct from the canonical aggregate.
 *  - All sums use 3-decimal KWD (no fils rounding tricks).
 */

export type DriverAggregate = {
  driverId: string | null;
  driverName: string;
  customers: number;
  invoices: number;
  /** Sum of per-row `totalDueKd` for this driver (UI sub-view only). */
  totalRemainingKd: number;
  /** Count of cross-referenced unpaid-link invoices for this driver. */
  unpaidLinks: number;
  /** Max `daysLate` across this driver's customers. */
  maxDaysLate: number;
};

export type BranchAggregate = {
  branchName: string;
  invoices: number;
  /** Sum of per-row `amountKd` from unpaid-online rows (UI sub-view). */
  totalRemainingKd: number;
  /** Distinct drivers attached to invoices in this branch. */
  driversCount: number;
};

const NO_DRIVER_LABEL = 'بدون سائق';
const NO_BRANCH_LABEL = 'بدون فرع';

function safeNum(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Group outstanding rows by driver. Each row already carries a
 * backend-supplied `totalDueKd`; we only sum within a group for the
 * driver sub-table (a UI breakdown, not the canonical total).
 */
export function groupOutstandingByDriver(
  rows: ReadonlyArray<OutstandingRow>,
  unpaidLinks: ReadonlyArray<CollectionUnpaidOnlineRow>,
): DriverAggregate[] {
  const linksByDriver = new Map<string, number>();
  for (const link of unpaidLinks) {
    const key = (link.driverName ?? '').trim() || NO_DRIVER_LABEL;
    linksByDriver.set(key, (linksByDriver.get(key) ?? 0) + 1);
  }

  const map = new Map<string, DriverAggregate>();
  for (const row of rows) {
    const key = row.driverId ?? '__no_driver__';
    const name = (row.driverName ?? '').trim() || NO_DRIVER_LABEL;
    const existing = map.get(key);
    if (existing) {
      existing.customers += 1;
      existing.invoices += row.invoicesCount;
      existing.totalRemainingKd += safeNum(row.totalDueKd);
      if (row.daysLate > existing.maxDaysLate) existing.maxDaysLate = row.daysLate;
    } else {
      map.set(key, {
        driverId: row.driverId,
        driverName: name,
        customers: 1,
        invoices: row.invoicesCount,
        totalRemainingKd: safeNum(row.totalDueKd),
        unpaidLinks: linksByDriver.get(name) ?? 0,
        maxDaysLate: row.daysLate,
      });
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => b.totalRemainingKd - a.totalRemainingKd,
  );
}

/**
 * Group unpaid-online rows by branch. Branch metadata is sourced from
 * `CollectionUnpaidOnlineRow.branchName` (the only frontend-visible
 * branch field today).
 */
export function groupUnpaidByBranch(
  rows: ReadonlyArray<CollectionUnpaidOnlineRow>,
): BranchAggregate[] {
  const map = new Map<string, BranchAggregate & { driverSet: Set<string> }>();
  for (const row of rows) {
    const key = (row.branchName ?? '').trim() || NO_BRANCH_LABEL;
    const driver = (row.driverName ?? '').trim() || NO_DRIVER_LABEL;
    const existing = map.get(key);
    if (existing) {
      existing.invoices += 1;
      existing.totalRemainingKd += safeNum(row.amountKd);
      existing.driverSet.add(driver);
      existing.driversCount = existing.driverSet.size;
    } else {
      const driverSet = new Set<string>();
      driverSet.add(driver);
      map.set(key, {
        branchName: key,
        invoices: 1,
        totalRemainingKd: safeNum(row.amountKd),
        driversCount: 1,
        driverSet,
      });
    }
  }
  return Array.from(map.values())
    .map(({ driverSet: _driverSet, ...keep }) => keep)
    .sort((a, b) => b.totalRemainingKd - a.totalRemainingKd);
}

/**
 * Filter unpaid-online rows down to the ones the agent should chase
 * via WhatsApp / payment-link reminders. We treat any non-canceled
 * row that already carries a hosted-link footprint (paymentUrl
 * present, OR a previous reminder, OR explicitly PAYMENT_LINK /
 * ONLINE) as "has payment link".
 */
export function filterUnpaidLinks(
  rows: ReadonlyArray<CollectionUnpaidOnlineRow>,
  opts: { onlyWithLink?: boolean } = {},
): CollectionUnpaidOnlineRow[] {
  return rows.filter((row) => {
    const remaining = safeNum(row.amountKd);
    if (remaining <= 0) return false;
    if (!opts.onlyWithLink) return true;
    if (row.paymentUrl) return true;
    if (row.reminderCount > 0) return true;
    return row.paymentMethod === 'PAYMENT_LINK' || row.paymentMethod === 'ONLINE';
  });
}
