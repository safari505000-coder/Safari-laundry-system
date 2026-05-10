import { OrderStatus, Prisma } from '@prisma/client';

/**
 * V21 Canonical Banking Core projection contract.
 *
 * This file owns reusable projection selectors for statement totals, report
 * running balances, and other read-model-only financial summaries. It must stay
 * read-only and must not write ledger/journal rows.
 */

export type CanonicalStatementInvoiceInput = {
  totalKd: string | number | Prisma.Decimal;
  status: OrderStatus | string;
  openDebt: boolean;
};

export type CanonicalStatementInvoiceGroup = 'UNPAID' | 'PAID' | 'CANCELED';

export type CanonicalStatementTotals = {
  totalInvoicedKd: string;
  totalPaidInvoicesKd: string;
  totalOpenInvoicesKd: string;
  unpaidInvoiceCount: number;
  paidInvoiceCount: number;
  canceledInvoiceCount: number;
};

export function canonicalStatementInvoiceGroup(
  invoice: Pick<CanonicalStatementInvoiceInput, 'status' | 'openDebt'>,
): CanonicalStatementInvoiceGroup {
  if (invoice.status === OrderStatus.CANCELED || invoice.status === 'CANCELED') {
    return 'CANCELED';
  }
  return invoice.openDebt ? 'UNPAID' : 'PAID';
}

export function computeCanonicalStatementTotals(
  invoices: ReadonlyArray<CanonicalStatementInvoiceInput>,
): CanonicalStatementTotals {
  const totals = invoices.reduce(
    (acc, inv) => {
      if (inv.status === OrderStatus.CANCELED || inv.status === 'CANCELED') {
        acc.canceledInvoiceCount += 1;
        return acc;
      }
      const total = new Prisma.Decimal(inv.totalKd.toString());
      acc.totalInvoiced = acc.totalInvoiced.plus(total);
      if (inv.openDebt) {
        acc.totalOpen = acc.totalOpen.plus(total);
        acc.unpaidInvoiceCount += 1;
      } else {
        acc.totalPaid = acc.totalPaid.plus(total);
        acc.paidInvoiceCount += 1;
      }
      return acc;
    },
    {
      totalInvoiced: new Prisma.Decimal(0),
      totalPaid: new Prisma.Decimal(0),
      totalOpen: new Prisma.Decimal(0),
      unpaidInvoiceCount: 0,
      paidInvoiceCount: 0,
      canceledInvoiceCount: 0,
    },
  );
  return {
    totalInvoicedKd: totals.totalInvoiced.toFixed(4),
    totalPaidInvoicesKd: totals.totalPaid.toFixed(4),
    totalOpenInvoicesKd: totals.totalOpen.toFixed(4),
    unpaidInvoiceCount: totals.unpaidInvoiceCount,
    paidInvoiceCount: totals.paidInvoiceCount,
    canceledInvoiceCount: totals.canceledInvoiceCount,
  };
}

export type CanonicalStatementEventInput = {
  kind: string;
  amountKd: string | number | Prisma.Decimal;
  balanceAfterKd: string | number | Prisma.Decimal;
  debtAfterKd: string | number | Prisma.Decimal;
  debtSettledKd: string | number | Prisma.Decimal;
  debtDiscountKd: string | number | Prisma.Decimal;
  closedInvoices?: ReadonlyArray<{ totalKd: string | number | Prisma.Decimal }>;
};

export type CanonicalStatementEventProjection = {
  isCredit: boolean;
  effectiveDebtAfterKd: string;
  hasDebtDiscount: boolean;
  hasDebtSettled: boolean;
  closedInvoicesTotalKd: string;
};

export function computeCanonicalStatementEventProjection(
  event: CanonicalStatementEventInput,
): CanonicalStatementEventProjection {
  const amount = new Prisma.Decimal(event.amountKd.toString());
  const balanceAfter = new Prisma.Decimal(event.balanceAfterKd.toString());
  const debtAfter = new Prisma.Decimal(event.debtAfterKd.toString());
  const debtSettled = new Prisma.Decimal(event.debtSettledKd.toString());
  const debtDiscount = new Prisma.Decimal(event.debtDiscountKd.toString());
  const negativeBalanceDebt = balanceAfter.lessThan(0)
    ? balanceAfter.abs()
    : new Prisma.Decimal(0);
  const closedInvoicesTotal = (event.closedInvoices ?? []).reduce(
    (acc, invoice) => acc.plus(new Prisma.Decimal(invoice.totalKd.toString())),
    new Prisma.Decimal(0),
  );

  return {
    isCredit: event.kind === 'SUBSCRIPTION_ACTIVATION' || amount.lessThan(0),
    effectiveDebtAfterKd: debtAfter.plus(negativeBalanceDebt).toFixed(4),
    hasDebtDiscount: debtDiscount.greaterThan(0),
    hasDebtSettled: debtSettled.greaterThan(0),
    closedInvoicesTotalKd: closedInvoicesTotal.toFixed(4),
  };
}

export type CanonicalRunningRemainingInput = {
  customerId: string;
  orderId: string;
  issuedAt: string | Date;
  debtSource?: string | null;
  remainingKd: string | number | Prisma.Decimal;
};

export type CanonicalRunningRemainingResult<T> = T & {
  customerRunningRemainingKd: string;
};

export type CanonicalOutstandingDriverInput = {
  driverId?: string | null;
  driverName?: string | null;
  invoicesCount: number;
  totalDueKd: string | number | Prisma.Decimal;
  daysLate: number;
};

export type CanonicalOutstandingDriverSummary = {
  driverId: string | null;
  driverName: string;
  customers: number;
  invoices: number;
  totalRemainingKd: string;
  maxDaysLate: number;
};

export type CanonicalUnpaidOnlineReportRow = {
  amountKd: string | number | Prisma.Decimal;
  branchName?: string | null;
  driverName?: string | null;
  paymentUrl?: string | null;
  reminderCount: number;
  paymentMethod?: string | null;
};

export type CanonicalUnpaidOnlineBranchSummary = {
  branchName: string;
  invoices: number;
  totalRemainingKd: string;
  driversCount: number;
};

export type CanonicalUnpaidOnlinePaymentLinkSummary = {
  totalRows: number;
  actionableRows: number;
};

export type CanonicalUnpaidOnlineReportProjection = {
  branchSummaries: CanonicalUnpaidOnlineBranchSummary[];
  paymentLinkSummary: CanonicalUnpaidOnlinePaymentLinkSummary;
  paymentLinkRowIndexes: number[];
};

export type CanonicalDebtRecoveryDayInput = {
  recoveredKd: string | number | Prisma.Decimal;
  settlementCount: number;
  subscriptionCount: number;
};

export type CanonicalDebtRecoverySummary = {
  totalSettlements: number;
  totalSubscriptions: number;
  maxRecoveredKd: string;
  trendRatios: number[];
};

export type CanonicalCommissionPayoutTotalsInput = {
  pendingKd: string | number | Prisma.Decimal;
  releasedKd: string | number | Prisma.Decimal;
  paidKd: string | number | Prisma.Decimal;
  cancelledKd: string | number | Prisma.Decimal;
};

export type CanonicalCommissionPayoutSummaryTotals = {
  pendingKd: string;
  releasedKd: string;
  paidKd: string;
  cancelledKd: string;
};

export type CanonicalDriverPendingInvoiceInput = {
  amountKd: string | number | Prisma.Decimal;
  searchableText: string;
};

export type CanonicalDriverPendingInvoiceProjection<T> = {
  rows: T[];
  totalAmountKd: string;
  filteredCount: number;
  totalCount: number;
};

export type CanonicalDriverCashCustodyInput = {
  amountKd: string | number | Prisma.Decimal;
};

export type CanonicalDriverCashCustodySummary = {
  cashTotalKd: string;
  cashOrderCount: number;
  grandTotalKd: string;
};

const debtSourceSortRank = (source: string | null | undefined): number => {
  if (source === 'INVOICE_SHORTFALL') return 0;
  if (source === 'SUBSCRIPTION_OVERUSE') return 1;
  return 2;
};

export function attachCanonicalRunningRemaining<
  T extends CanonicalRunningRemainingInput,
>(rows: ReadonlyArray<T>): Array<CanonicalRunningRemainingResult<T>> {
  const output = rows.map((row) => ({
    ...row,
    customerRunningRemainingKd: '0.0000',
  }));
  const byCustomer = new Map<string, Array<CanonicalRunningRemainingResult<T>>>();
  for (const row of output) {
    const bucket = byCustomer.get(row.customerId) ?? [];
    bucket.push(row);
    byCustomer.set(row.customerId, bucket);
  }
  for (const bucket of byCustomer.values()) {
    const chronological = [...bucket].sort((a, b) => {
      const ta = new Date(a.issuedAt).getTime();
      const tb = new Date(b.issuedAt).getTime();
      if (ta !== tb) return ta - tb;
      if (a.orderId !== b.orderId) return a.orderId.localeCompare(b.orderId);
      return debtSourceSortRank(a.debtSource) - debtSourceSortRank(b.debtSource);
    });
    let running = new Prisma.Decimal(0);
    for (const row of chronological) {
      running = running.plus(new Prisma.Decimal(row.remainingKd.toString()));
      row.customerRunningRemainingKd = running.toFixed(4);
    }
  }
  return output;
}

const NO_DRIVER_LABEL = 'بدون سائق';
const NO_BRANCH_LABEL = 'بدون فرع';

export function computeCanonicalOutstandingDriverSummaries(
  rows: ReadonlyArray<CanonicalOutstandingDriverInput>,
): CanonicalOutstandingDriverSummary[] {
  const byDriver = new Map<string, {
    driverId: string | null;
    driverName: string;
    customers: number;
    invoices: number;
    totalRemaining: Prisma.Decimal;
    maxDaysLate: number;
  }>();

  for (const row of rows) {
    const driverId = row.driverId ?? null;
    const key = driverId ?? '__no_driver__';
    const existing = byDriver.get(key);
    const amount = new Prisma.Decimal(row.totalDueKd ?? 0);
    if (existing) {
      existing.customers += 1;
      existing.invoices += row.invoicesCount;
      existing.totalRemaining = existing.totalRemaining.plus(amount);
      existing.maxDaysLate = Math.max(existing.maxDaysLate, row.daysLate);
      continue;
    }

    byDriver.set(key, {
      driverId,
      driverName: (row.driverName ?? '').trim() || NO_DRIVER_LABEL,
      customers: 1,
      invoices: row.invoicesCount,
      totalRemaining: amount,
      maxDaysLate: row.daysLate,
    });
  }

  return Array.from(byDriver.values())
    .map((row) => ({
      driverId: row.driverId,
      driverName: row.driverName,
      customers: row.customers,
      invoices: row.invoices,
      totalRemainingKd: row.totalRemaining.toFixed(3),
      maxDaysLate: row.maxDaysLate,
    }))
    .sort((a, b) => {
      const byAmount = new Prisma.Decimal(b.totalRemainingKd)
        .sub(a.totalRemainingKd)
        .toNumber();
      if (byAmount !== 0) return byAmount;
      return a.driverName.localeCompare(b.driverName);
    });
}

export function computeCanonicalUnpaidOnlineReportProjection(
  rows: ReadonlyArray<CanonicalUnpaidOnlineReportRow>,
): CanonicalUnpaidOnlineReportProjection {
  const byBranch = new Map<
    string,
    {
      branchName: string;
      invoices: number;
      totalRemaining: Prisma.Decimal;
      drivers: Set<string>;
    }
  >();
  let actionableRows = 0;

  const paymentLinkRowIndexes: number[] = [];

  rows.forEach((row, index) => {
    const branchName = (row.branchName ?? '').trim() || NO_BRANCH_LABEL;
    const driverName = (row.driverName ?? '').trim() || NO_DRIVER_LABEL;
    const existing =
      byBranch.get(branchName) ??
      {
        branchName,
        invoices: 0,
        totalRemaining: new Prisma.Decimal(0),
        drivers: new Set<string>(),
      };
    existing.invoices += 1;
    existing.totalRemaining = existing.totalRemaining.plus(
      new Prisma.Decimal(row.amountKd ?? 0),
    );
    existing.drivers.add(driverName);
    byBranch.set(branchName, existing);

    if (isCanonicalPaymentLinkActionable(row)) {
      actionableRows += 1;
      paymentLinkRowIndexes.push(index);
    }
  });

  return {
    branchSummaries: Array.from(byBranch.values())
      .map((row) => ({
        branchName: row.branchName,
        invoices: row.invoices,
        totalRemainingKd: row.totalRemaining.toFixed(3),
        driversCount: row.drivers.size,
      }))
      .sort((a, b) => {
        const byAmount = new Prisma.Decimal(b.totalRemainingKd)
          .sub(a.totalRemainingKd)
          .toNumber();
        if (byAmount !== 0) return byAmount;
        return a.branchName.localeCompare(b.branchName);
      }),
    paymentLinkSummary: {
      totalRows: rows.length,
      actionableRows,
    },
    paymentLinkRowIndexes,
  };
}

function isCanonicalPaymentLinkActionable(
  row: CanonicalUnpaidOnlineReportRow,
): boolean {
  const amount = new Prisma.Decimal(row.amountKd ?? 0);
  if (amount.lte(0)) return false;
  if ((row.paymentUrl ?? '').trim()) return true;
  if (row.reminderCount > 0) return true;
  return row.paymentMethod === 'PAYMENT_LINK' || row.paymentMethod === 'ONLINE';
}

export function computeCanonicalDebtRecoverySummary(
  days: ReadonlyArray<CanonicalDebtRecoveryDayInput>,
): CanonicalDebtRecoverySummary {
  let totalSettlements = 0;
  let totalSubscriptions = 0;
  let maxRecovered = new Prisma.Decimal(0);
  const recovered = days.map((day) => {
    totalSettlements += day.settlementCount;
    totalSubscriptions += day.subscriptionCount;
    const value = new Prisma.Decimal(day.recoveredKd ?? 0);
    if (value.greaterThan(maxRecovered)) maxRecovered = value;
    return value;
  });

  return {
    totalSettlements,
    totalSubscriptions,
    maxRecoveredKd: maxRecovered.toFixed(4),
    trendRatios: recovered.map((value) => {
      if (maxRecovered.lte(0)) return 0;
      return Math.round(value.div(maxRecovered).toNumber() * 100);
    }),
  };
}

export function computeCanonicalCommissionPayoutSummaryTotals(
  totals: ReadonlyArray<CanonicalCommissionPayoutTotalsInput>,
): CanonicalCommissionPayoutSummaryTotals {
  const out = {
    pending: new Prisma.Decimal(0),
    released: new Prisma.Decimal(0),
    paid: new Prisma.Decimal(0),
    cancelled: new Prisma.Decimal(0),
  };

  for (const row of totals) {
    out.pending = out.pending.plus(new Prisma.Decimal(row.pendingKd ?? 0));
    out.released = out.released.plus(new Prisma.Decimal(row.releasedKd ?? 0));
    out.paid = out.paid.plus(new Prisma.Decimal(row.paidKd ?? 0));
    out.cancelled = out.cancelled.plus(new Prisma.Decimal(row.cancelledKd ?? 0));
  }

  return {
    pendingKd: out.pending.toFixed(4),
    releasedKd: out.released.toFixed(4),
    paidKd: out.paid.toFixed(4),
    cancelledKd: out.cancelled.toFixed(4),
  };
}

export function computeCanonicalDriverPendingInvoiceProjection<
  T extends CanonicalDriverPendingInvoiceInput,
>(
  rows: ReadonlyArray<T>,
  search?: string | null,
): CanonicalDriverPendingInvoiceProjection<T> {
  const needle = (search ?? '').trim().toLowerCase();
  const filtered =
    needle ?
      rows.filter((row) => row.searchableText.toLowerCase().includes(needle))
    : [...rows];
  const total = filtered.reduce(
    (sum, row) => sum.plus(new Prisma.Decimal(row.amountKd ?? 0)),
    new Prisma.Decimal(0),
  );

  return {
    rows: filtered,
    totalAmountKd: total.toFixed(3),
    filteredCount: filtered.length,
    totalCount: rows.length,
  };
}

export function computeCanonicalDriverCashCustodySummary(
  rows: ReadonlyArray<CanonicalDriverCashCustodyInput>,
): CanonicalDriverCashCustodySummary {
  const total = rows.reduce(
    (sum, row) => sum.plus(new Prisma.Decimal(row.amountKd ?? 0)),
    new Prisma.Decimal(0),
  );
  return {
    cashTotalKd: total.toFixed(3),
    cashOrderCount: rows.length,
    grandTotalKd: total.toFixed(3),
  };
}
