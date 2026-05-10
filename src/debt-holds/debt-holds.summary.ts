import { Prisma } from '@prisma/client';

/**
 * V21 Phase 5 — canonical debt-hold list summariser.
 *
 * Pure, deterministic, db-free. Takes the raw Prisma rows from the
 * `DebtHoldsService.list` query and emits the wrapped response that
 * the frontend consumes as-is. The frontend never aggregates these
 * monetary fields locally any more — `totals` and `perEmployee` are
 * the canonical truth and the page just renders them.
 */

export type DebtHoldRowForSummary = {
  id: string;
  employeeUserId: string;
  status: 'HELD' | 'RELEASED' | string;
  holdAmount: Prisma.Decimal | string;
  releasedAmount: Prisma.Decimal | string;
  disbursedAt: Date | string | null;
  employee: { id: string; fullName: string; username: string };
};

export type DebtHoldTotals = {
  /** Sum of `holdAmount` across rows whose status === 'HELD' (4dp). */
  heldKd: string;
  /** Sum of `releasedAmount` across RELEASED rows that are NOT yet disbursed (4dp). */
  pendingKd: string;
  /** Sum of `releasedAmount` across RELEASED rows that have been disbursed (4dp). */
  disbursedKd: string;
};

export type DebtHoldEmployeeBucket = {
  employeeUserId: string;
  fullName: string;
  heldKd: string;
  pendingKd: string;
  disbursedKd: string;
  heldIds: string[];
  pendingIds: string[];
};

export type DebtHoldsListResponse<R extends DebtHoldRowForSummary> = {
  rows: R[];
  totals: DebtHoldTotals;
  perEmployee: DebtHoldEmployeeBucket[];
};

function toDecimal(value: Prisma.Decimal | string): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) return value;
  return new Prisma.Decimal(value);
}

export function summariseDebtHolds<R extends DebtHoldRowForSummary>(
  rows: R[],
): DebtHoldsListResponse<R> {
  let held = new Prisma.Decimal(0);
  let pending = new Prisma.Decimal(0);
  let disbursed = new Prisma.Decimal(0);

  type Bucket = {
    employeeUserId: string;
    fullName: string;
    held: Prisma.Decimal;
    pending: Prisma.Decimal;
    disbursed: Prisma.Decimal;
    heldIds: string[];
    pendingIds: string[];
  };
  const map = new Map<string, Bucket>();

  for (const r of rows) {
    const e = map.get(r.employeeUserId) ?? {
      employeeUserId: r.employeeUserId,
      fullName: r.employee.fullName,
      held: new Prisma.Decimal(0),
      pending: new Prisma.Decimal(0),
      disbursed: new Prisma.Decimal(0),
      heldIds: [],
      pendingIds: [],
    };
    if (r.status === 'HELD') {
      const h = toDecimal(r.holdAmount);
      held = held.add(h);
      e.held = e.held.add(h);
      e.heldIds.push(r.id);
    } else if (r.status === 'RELEASED') {
      const x = toDecimal(r.releasedAmount);
      if (r.disbursedAt) {
        disbursed = disbursed.add(x);
        e.disbursed = e.disbursed.add(x);
      } else {
        pending = pending.add(x);
        e.pending = e.pending.add(x);
        e.pendingIds.push(r.id);
      }
    }
    map.set(r.employeeUserId, e);
  }

  const perEmployee: DebtHoldEmployeeBucket[] = Array.from(map.values())
    .sort((a, b) => b.held.comparedTo(a.held))
    .map((e) => ({
      employeeUserId: e.employeeUserId,
      fullName: e.fullName,
      heldKd: e.held.toFixed(4),
      pendingKd: e.pending.toFixed(4),
      disbursedKd: e.disbursed.toFixed(4),
      heldIds: e.heldIds,
      pendingIds: e.pendingIds,
    }));

  return {
    rows,
    totals: {
      heldKd: held.toFixed(4),
      pendingKd: pending.toFixed(4),
      disbursedKd: disbursed.toFixed(4),
    },
    perEmployee,
  };
}
