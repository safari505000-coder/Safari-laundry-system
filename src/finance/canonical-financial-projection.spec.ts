import { OrderStatus } from '@prisma/client';
import {
  attachCanonicalRunningRemaining,
  canonicalStatementInvoiceGroup,
  computeCanonicalOutstandingDriverSummaries,
  computeCanonicalDebtRecoverySummary,
  computeCanonicalCommissionPayoutSummaryTotals,
  computeCanonicalDriverPendingInvoiceProjection,
  computeCanonicalDriverCashCustodySummary,
  computeCanonicalStatementEventProjection,
  computeCanonicalStatementTotals,
  computeCanonicalUnpaidOnlineReportProjection,
} from './canonical-financial-projection';

describe('canonical financial projection selectors', () => {
  it('computes statement totals once on the backend projection layer', () => {
    expect(
      computeCanonicalStatementTotals([
        { totalKd: '10.0000', status: OrderStatus.COMPLETED, openDebt: false },
        { totalKd: '5.2500', status: OrderStatus.COMPLETED, openDebt: true },
        { totalKd: '99.0000', status: OrderStatus.CANCELED, openDebt: true },
      ]),
    ).toEqual({
      totalInvoicedKd: '15.2500',
      totalPaidInvoicesKd: '10.0000',
      totalOpenInvoicesKd: '5.2500',
      unpaidInvoiceCount: 1,
      paidInvoiceCount: 1,
      canceledInvoiceCount: 1,
    });
  });

  it('classifies statement invoice rows without frontend debt math', () => {
    expect(
      canonicalStatementInvoiceGroup({
        status: OrderStatus.COMPLETED,
        openDebt: true,
      }),
    ).toBe('UNPAID');
    expect(
      canonicalStatementInvoiceGroup({
        status: OrderStatus.COMPLETED,
        openDebt: false,
      }),
    ).toBe('PAID');
    expect(
      canonicalStatementInvoiceGroup({
        status: OrderStatus.CANCELED,
        openDebt: true,
      }),
    ).toBe('CANCELED');
  });

  it('computes statement event display projections once on the backend', () => {
    expect(
      computeCanonicalStatementEventProjection({
        kind: 'SUBSCRIPTION_ACTIVATION',
        amountKd: '40.0000',
        balanceAfterKd: '-2.0000',
        debtAfterKd: '3.0000',
        debtSettledKd: '5.0000',
        debtDiscountKd: '1.2500',
        closedInvoices: [{ totalKd: '2.5000' }, { totalKd: '1.0000' }],
      }),
    ).toEqual({
      isCredit: true,
      effectiveDebtAfterKd: '5.0000',
      hasDebtDiscount: true,
      hasDebtSettled: true,
      closedInvoicesTotalKd: '3.5000',
    });
  });

  it('computes canonical outstanding driver summaries from backend rows', () => {
    const summaries = computeCanonicalOutstandingDriverSummaries([
      {
        driverId: 'driver-a',
        driverName: 'Driver A',
        invoicesCount: 2,
        totalDueKd: '3.250',
        daysLate: 4,
      },
      {
        driverId: 'driver-a',
        driverName: 'Driver A',
        invoicesCount: 1,
        totalDueKd: '2.000',
        daysLate: 7,
      },
      {
        driverId: null,
        driverName: null,
        invoicesCount: 1,
        totalDueKd: '1.000',
        daysLate: 1,
      },
    ]);

    expect(summaries).toEqual([
      {
        driverId: 'driver-a',
        driverName: 'Driver A',
        customers: 2,
        invoices: 3,
        totalRemainingKd: '5.250',
        maxDaysLate: 7,
      },
      {
        driverId: null,
        driverName: 'بدون سائق',
        customers: 1,
        invoices: 1,
        totalRemainingKd: '1.000',
        maxDaysLate: 1,
      },
    ]);
  });

  it('computes canonical unpaid-online report projection', () => {
    const projection = computeCanonicalUnpaidOnlineReportProjection([
      {
        branchName: 'Salmiya',
        driverName: 'Driver A',
        amountKd: '2.250',
        paymentUrl: 'https://pay.example/1',
        reminderCount: 0,
        paymentMethod: 'ONLINE',
      },
      {
        branchName: 'Salmiya',
        driverName: 'Driver B',
        amountKd: '1.000',
        paymentUrl: null,
        reminderCount: 0,
        paymentMethod: 'CASH',
      },
      {
        branchName: null,
        driverName: null,
        amountKd: '4.000',
        paymentUrl: null,
        reminderCount: 2,
        paymentMethod: 'CASH',
      },
    ]);

    expect(projection).toEqual({
      branchSummaries: [
        {
          branchName: 'بدون فرع',
          invoices: 1,
          totalRemainingKd: '4.000',
          driversCount: 1,
        },
        {
          branchName: 'Salmiya',
          invoices: 2,
          totalRemainingKd: '3.250',
          driversCount: 2,
        },
      ],
      paymentLinkSummary: {
        totalRows: 3,
        actionableRows: 2,
      },
      paymentLinkRowIndexes: [0, 2],
    });
  });

  it('computes canonical debt recovery summary and trend ratios', () => {
    const summary = computeCanonicalDebtRecoverySummary([
      { recoveredKd: '0.0000', settlementCount: 1, subscriptionCount: 0 },
      { recoveredKd: '5.0000', settlementCount: 2, subscriptionCount: 1 },
      { recoveredKd: '2.5000', settlementCount: 0, subscriptionCount: 3 },
    ]);

    expect(summary).toEqual({
      totalSettlements: 3,
      totalSubscriptions: 4,
      maxRecoveredKd: '5.0000',
      trendRatios: [0, 100, 50],
    });
  });

  it('computes canonical commission payout summary totals', () => {
    expect(
      computeCanonicalCommissionPayoutSummaryTotals([
        {
          pendingKd: '1.0000',
          releasedKd: '2.2500',
          paidKd: '3.0000',
          cancelledKd: '0.5000',
        },
        {
          pendingKd: '4.0000',
          releasedKd: '0.7500',
          paidKd: '1.0000',
          cancelledKd: '0.0000',
        },
      ]),
    ).toEqual({
      pendingKd: '5.0000',
      releasedKd: '3.0000',
      paidKd: '4.0000',
      cancelledKd: '0.5000',
    });
  });

  it('computes search-aware driver pending invoice totals from filtered rows', () => {
    const projection = computeCanonicalDriverPendingInvoiceProjection(
      [
        {
          id: 'a',
          amountKd: '3.250',
          searchableText: 'INV-A Acme 9900 note',
        },
        {
          id: 'b',
          amountKd: '2.000',
          searchableText: 'INV-B Beta 8800',
        },
      ],
      'acme',
    );

    expect(projection).toEqual({
      rows: [
        {
          id: 'a',
          amountKd: '3.250',
          searchableText: 'INV-A Acme 9900 note',
        },
      ],
      totalAmountKd: '3.250',
      filteredCount: 1,
      totalCount: 2,
    });
  });

  it('computes canonical driver cash custody summary', () => {
    expect(
      computeCanonicalDriverCashCustodySummary([
        { amountKd: '1.250' },
        { amountKd: '2.000' },
      ]),
    ).toEqual({
      cashTotalKd: '3.250',
      cashOrderCount: 2,
      grandTotalKd: '3.250',
    });
  });

  it('attaches per-customer running remaining balances in canonical timeline order', () => {
    const rows = attachCanonicalRunningRemaining([
      {
        customerId: 'c1',
        orderId: 'o2',
        issuedAt: '2026-05-02T00:00:00.000Z',
        debtSource: 'INVOICE_SHORTFALL',
        remainingKd: '2.0000',
      },
      {
        customerId: 'c1',
        orderId: 'o1',
        issuedAt: '2026-05-01T00:00:00.000Z',
        debtSource: 'INVOICE_SHORTFALL',
        remainingKd: '3.2500',
      },
      {
        customerId: 'c2',
        orderId: 'o3',
        issuedAt: '2026-05-01T00:00:00.000Z',
        debtSource: 'INVOICE_SHORTFALL',
        remainingKd: '1.0000',
      },
    ]);

    expect(rows[0]!.customerRunningRemainingKd).toBe('5.2500');
    expect(rows[1]!.customerRunningRemainingKd).toBe('3.2500');
    expect(rows[2]!.customerRunningRemainingKd).toBe('1.0000');
  });
});
