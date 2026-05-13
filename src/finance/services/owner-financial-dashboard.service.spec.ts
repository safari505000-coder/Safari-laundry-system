import { Prisma } from '@prisma/client';
import { OwnerFinancialDashboardService } from './owner-financial-dashboard.service';
import { computeCustomer360FinancialCore } from '../../customers/customer-360-financials';

jest.mock('../../customers/customer-360-financials', () => ({
  computeCustomer360FinancialCore: jest.fn(),
}));

describe('OwnerFinancialDashboardService', () => {
  it('returns cached dashboard shape using canonical customer financials', async () => {
    (computeCustomer360FinancialCore as jest.Mock).mockResolvedValue({
      consumedKd: '10.0000',
      totalInvoicesKd: '10.0000',
      subscriptionValueKd: '0.0000',
      subscriptionConsumedKd: '0.0000',
      subscriptionRemainingKd: '0.0000',
      totalPaymentsKd: '2.0000',
      // V23.2 — DTO returns canonical receivable directly. The legacy
      // `totalDueKd` field was dropped; the rollup reads
      // `canonicalDebtKd` for both the per-customer row and the
      // aggregate `canonicalDebtTotal`.
      canonicalDebtKd: '8.0000',
      canonicalDebtSource: 'PARTIAL_PAYMENT_REMAINING',
      isBlocked: false,
      blockReason: null,
      blockedAtIso: null,
      breakdown: {
        receivableDebtKd: '8.0000',
        subscriptionRemainingKd: '0.0000',
        walletPrepaidCreditKd: '0.0000',
        paidTotalKd: '2.0000',
        operatorHint: 'العميل مدين بمبلغ 8.0000 د.ك',
      },
    });
    const prisma = {
      order: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { totalPrice: new Prisma.Decimal('10.0000') },
        }),
        findMany: jest.fn().mockResolvedValue([
          { id: 'order-1', totalPrice: new Prisma.Decimal('2.0000') },
        ]),
      },
      debtLedgerEntry: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      // V20.4 — totalPayments now reads CR on account 1300 from JournalLine.
      journalLine: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      managerCashCustody: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { amountKd: new Prisma.Decimal('3.0000') },
        }),
      },
      customer: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'customer-1', displayName: 'Customer One', phone: '50000000' },
        ]),
      },
    };
    const cache = {
      cacheKey: jest.fn().mockReturnValue('owner-key'),
      wrapJson: jest.fn(async (_key: string, fn: () => Promise<unknown>) => fn()),
    };
    const service = new OwnerFinancialDashboardService(
      prisma as any,
      { getTotalCashWithDrivers: jest.fn().mockResolvedValue('4.0000') } as any,
      {
        resolveWindow: jest.fn().mockReturnValue({
          cur: {
            from: new Date('2026-05-02T00:00:00.000Z'),
            to: new Date('2026-05-02T23:59:59.000Z'),
          },
          prev: {
            from: new Date('2026-05-01T00:00:00.000Z'),
            to: new Date('2026-05-01T23:59:59.000Z'),
          },
        }),
        getReconciliation: jest.fn().mockResolvedValue({ differenceKd: '1.0000' }),
      } as any,
      {
        buildCustomerIntelligence: jest.fn().mockResolvedValue({
          customerHealth: 'WATCH',
          paymentConsistency: 0.2,
          avgPaymentDelayHours: 4,
          lifetimeValueKd: '10.0000',
        }),
      } as any,
      { getRiskyDrivers: jest.fn().mockResolvedValue([]) } as any,
      {
        expenseWindowTotals: jest.fn().mockResolvedValue({
          currentKd: '0.0000',
          previousKd: '0.0000',
        }),
        buildAlerts: jest.fn().mockResolvedValue([]),
      } as any,
      cache as any,
      { getCustomerDebtFromJournalAR: jest.fn().mockResolvedValue(new Prisma.Decimal('8.0000')) } as any,
    );

    const result = await service.getDashboard();

    expect(cache.wrapJson).toHaveBeenCalledWith('owner-key', expect.any(Function));
    expect(computeCustomer360FinancialCore).toHaveBeenCalledWith(
      prisma,
      'customer-1',
      expect.objectContaining({
        getCustomerDebtFromJournalAR: expect.any(Function),
      }),
    );
    expect(result).toMatchObject({
      totalInvoicesToday: '10.0000',
      totalPaymentsToday: '2.0000',
      canonicalDebtTotal: '8.0000',
      cashInDrivers: '4.0000',
      cashInOffice: '3.0000',
      reconciliationDifference: '1.0000',
    });
    expect(result.topCustomers[0]).toMatchObject({
      customerId: 'customer-1',
      canonicalDebtKd: '8.0000',
      customerHealth: 'WATCH',
    });
  });
});
