import { CashStatus, OrderStatus, PosPaymentMethod, Prisma } from '@prisma/client';
import { computeCustomer360FinancialCore } from './customer-360-financials';

// Re-bind the runtime constructor under the same name as the legacy
// import path; tests construct `new Decimal(...)` for fixtures.
const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

/**
 * V20.8.1 — Phase 4 explicit financial breakdown contract.
 *
 *   1. `breakdown.receivableDebtKd` matches `canonicalDebtKd`
 *   2. `breakdown.subscriptionRemainingKd` matches `subscriptionRemainingKd`
 *   3. `breakdown.walletPrepaidCreditKd` = max(0, walletBalance - subscriptionRemaining)
 *   4. `breakdown.paidTotalKd` matches `totalPaymentsKd`
 *   5. `breakdown.operatorHint` mentions debt + subscription remaining
 *   6. CASE #1 reproduction: 3.25 KD absorption → consumed=3.25, remaining=21.75
 */
function makePrisma(opts: {
  orders?: Array<any>;
  ledger?: Array<any>;
  subscription?: any | null;
  customer?: any;
  wallet?: { balance: Decimal | string | number } | null;
}) {
  return {
    order: {
      findMany: jest.fn().mockResolvedValue(opts.orders ?? []),
    },
    debtLedgerEntry: {
      findMany: jest.fn().mockResolvedValue(opts.ledger ?? []),
    },
    customerSubscription: {
      findFirst: jest.fn().mockResolvedValue(opts.subscription ?? null),
    },
    customer: {
      findUnique: jest.fn().mockResolvedValue(
        opts.customer ?? { isBlocked: false, blockReason: null, blockedAt: null },
      ),
    },
    customerWallet: {
      findUnique: jest.fn().mockResolvedValue(opts.wallet ?? null),
    },
    // V20.8.1 production code reads SUBSCRIPTION_ACTIVATION debt
    // settlements off this table; tests don't need fixture rows but
    // the stub must exist so the destructured query returns []. Added
    // during the V23 Phase 6 validation sweep — no behavioural change.
    transactionHistory: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as any;
}

describe('V20.8.1 — Customer 360 financial breakdown', () => {
  const CUSTOMER_ID = 'cust-1';

  it('1. breakdown.receivableDebtKd mirrors canonicalDebtKd', async () => {
    const prisma = makePrisma({
      orders: [
        {
          id: 'o1',
          status: OrderStatus.COMPLETED,
          totalPrice: new Decimal('10.0000'),
          cashStatus: CashStatus.UNPAID,
          posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
          subscriptionId: null,
        },
      ],
      ledger: [],
      wallet: { balance: new Decimal('0.0000') },
    });
    const r = await computeCustomer360FinancialCore(prisma, CUSTOMER_ID);
    expect(r.breakdown.receivableDebtKd).toBe(r.canonicalDebtKd);
  });

  it('2. breakdown.subscriptionRemainingKd mirrors subscriptionRemainingKd', async () => {
    const prisma = makePrisma({
      orders: [],
      ledger: [],
      subscription: {
        id: 'sub-1',
        planActualBalanceSnapshot: new Decimal('25.0000'),
        activatedAt: new Date('2026-05-01T00:00:00Z'),
      },
      wallet: { balance: new Decimal('25.0000') },
    });
    const r = await computeCustomer360FinancialCore(prisma, CUSTOMER_ID);
    expect(r.breakdown.subscriptionRemainingKd).toBe(r.subscriptionRemainingKd);
    expect(r.subscriptionRemainingKd).toBe('25.0000');
  });

  it('3. walletPrepaidCreditKd = max(0, walletBalance - subscriptionRemaining)', async () => {
    const prisma = makePrisma({
      orders: [],
      ledger: [],
      subscription: {
        id: 'sub-1',
        planActualBalanceSnapshot: new Decimal('25.0000'),
        activatedAt: new Date('2026-05-01T00:00:00Z'),
      },
      // Wallet has 30 — 25 belongs to subscription remaining; 5 is prepaid.
      wallet: { balance: new Decimal('30.0000') },
    });
    const r = await computeCustomer360FinancialCore(prisma, CUSTOMER_ID);
    expect(r.breakdown.walletPrepaidCreditKd).toBe('5.0000');
  });

  it('4. paidTotalKd mirrors totalPaymentsKd', async () => {
    const prisma = makePrisma({
      orders: [
        {
          id: 'o1',
          status: OrderStatus.COMPLETED,
          totalPrice: new Decimal('5.0000'),
          cashStatus: CashStatus.PAID_TO_DRIVER,
          posPaymentMethod: PosPaymentMethod.CASH,
          subscriptionId: null,
        },
      ],
      ledger: [],
      wallet: null,
    });
    const r = await computeCustomer360FinancialCore(prisma, CUSTOMER_ID);
    expect(r.breakdown.paidTotalKd).toBe(r.totalPaymentsKd);
    expect(r.totalPaymentsKd).toBe('5.0000');
  });

  it('5. operatorHint mentions debt + subscription remaining', async () => {
    const prisma = makePrisma({
      orders: [
        {
          id: 'o1',
          status: OrderStatus.COMPLETED,
          totalPrice: new Decimal('3.2500'),
          cashStatus: CashStatus.UNPAID,
          posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
          subscriptionId: null,
        },
      ],
      ledger: [],
      subscription: {
        id: 'sub-1',
        planActualBalanceSnapshot: new Decimal('25.0000'),
        activatedAt: new Date('2026-05-01T00:00:00Z'),
      },
      wallet: { balance: new Decimal('25.0000') },
    });
    const r = await computeCustomer360FinancialCore(prisma, CUSTOMER_ID);
    expect(r.breakdown.operatorHint).toContain('مدين');
    expect(r.breakdown.operatorHint).toContain('الباقة المتبقي');
  });

  it('6. CASE #1 — 3.25 KD invoice absorbed against 25 KD subscription', async () => {
    // Wallet was topped up by 25 (subscription) and then 3.25 was
    // absorbed against the open invoice → wallet = 21.75. The invoice
    // is now PAID. Customer 360 must show:
    //   • subscriptionConsumedKd = 3.25
    //   • subscriptionRemainingKd = 21.75
    //   • receivableDebtKd       = 0
    const prisma = makePrisma({
      orders: [
        {
          id: 'invoice-3-25',
          status: OrderStatus.COMPLETED,
          totalPrice: new Decimal('3.2500'),
          cashStatus: CashStatus.PAID_TO_DRIVER, // post-absorption settled
          posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
          subscriptionId: null,
        },
      ],
      ledger: [
        // The audit-only PAYMENT:WALLET row that V20.8.1 now consults.
        {
          orderId: 'invoice-3-25',
          source: 'PAYMENT',
          amount: new Decimal('3.2500'),
          sourceRef: 'PAYMENT:WALLET:invoice-3-25:APPLIED',
          createdAt: new Date('2026-05-02T08:30:00Z'),
        },
      ],
      subscription: {
        id: 'sub-case-1',
        planActualBalanceSnapshot: new Decimal('25.0000'),
        activatedAt: new Date('2026-05-01T10:00:00Z'),
      },
      wallet: { balance: new Decimal('21.7500') },
    });
    const r = await computeCustomer360FinancialCore(prisma, CUSTOMER_ID);
    expect(r.subscriptionConsumedKd).toBe('3.2500');
    expect(r.subscriptionRemainingKd).toBe('21.7500');
    expect(r.breakdown.subscriptionRemainingKd).toBe('21.7500');
  });
});
