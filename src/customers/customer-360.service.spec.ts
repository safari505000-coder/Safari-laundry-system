import { ForbiddenException } from '@nestjs/common';
import { CashStatus, OrderStatus, Prisma, PosPaymentMethod } from '@prisma/client';
import { Customer360Service } from './customer-360.service';
import type { JwtUser } from '../auth/decorators/current-user.decorator';

describe('Customer360Service', () => {
  const customerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  let prevFlag: string | undefined;
  beforeAll(() => {
    prevFlag = process.env.V20_4_FINAL_LEDGER;
    process.env.V20_4_FINAL_LEDGER = 'true';
  });
  afterAll(() => {
    if (prevFlag === undefined) delete process.env.V20_4_FINAL_LEDGER;
    else process.env.V20_4_FINAL_LEDGER = prevFlag;
  });

  function makeService(overrides?: Partial<{
    findUniqueCustomer: unknown;
    findManyOrders: unknown[];
    findManyLedger: unknown[];
    findManyJournalLine: unknown[];
    findFirstSub: unknown;
    findWallet: unknown;
    findManySubs: unknown[];
    aggregateFeedback: unknown;
    findManyTransactionHistory: unknown[];
  }>) {
    // V23.3 — Mock returns the union of every column either the
    // Customer 360 service OR the financial engine ever reads
    // (`displayName/phone/phone2` for the panel, and
    // `isBlocked/blockReason/blockedAt` for the engine), so the same
    // jest.fn handles both selectors transparently.
    const prisma = {
      customer: {
        findUnique: jest.fn().mockResolvedValue(
          overrides?.findUniqueCustomer ?? {
            id: customerId,
            displayName: 'X',
            phone: '500',
            phone2: null,
            isBlocked: false,
            blockReason: null,
            blockedAt: null,
          },
        ),
      },
      order: {
        findMany: jest.fn().mockResolvedValue(
          overrides?.findManyOrders ?? [
            {
              id: 'order-c360-1',  // V20.4: id required for journal-based remaining
              status: OrderStatus.COMPLETED,
              totalPrice: { toString: () => '3' },
              cashStatus: CashStatus.UNPAID,
              posPaymentMethod: PosPaymentMethod.ONLINE,
            },
          ],
        ),
      },
      // V20.4 — Journal path: default order has totalPrice=3, UNPAID,
      // with a payment of 1 (credit). Remaining = 2.
      journalLine: {
        findMany: jest.fn().mockImplementation(async (args: any) => {
          const orderIds: string[] = args?.where?.entry?.orderId?.in ?? [];
          if (overrides?.findManyJournalLine !== undefined) {
            return overrides.findManyJournalLine;
          }
    if (orderIds.length > 0) {
      // Issuance DR only — default payment (1 KD) is unattached (no orderId),
      // so it is NOT attributed to the order in Journal. Canonical debt = 3.0000.
      return orderIds.map((id) => (
        { debit: new Prisma.Decimal('3'), credit: new Prisma.Decimal('0'), entry: { orderId: id } }
      ));
    }
          return [];
        }),
      },
      customerSubscription: {
        findFirst: jest.fn().mockResolvedValue(
          overrides?.findFirstSub ?? {
            id: 'sub-1',
            planActualBalanceSnapshot: { toString: () => '10' },
            activatedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ),
        findMany: jest.fn().mockResolvedValue(overrides?.findManySubs ?? []),
      },
      customerWallet: {
        findUnique: jest.fn().mockResolvedValue(
          overrides?.findWallet ?? {
            balance: { toString: () => '2' },
            debt: { toString: () => '0.5' },
          },
        ),
      },
      orderFeedback: {
        aggregate: jest.fn().mockResolvedValue(
          overrides?.aggregateFeedback ?? { _avg: { rating: 5 } },
        ),
      },
      // V23.3 — Required by `computeCustomer360FinancialCore` which
      // reads SUBSCRIPTION_ACTIVATION transaction history rows to
      // attribute activation-time debt settlements. Default `[]` is
      // correct for tests that don't exercise that code path.
      transactionHistory: {
        findMany: jest
          .fn()
          .mockResolvedValue(overrides?.findManyTransactionHistory ?? []),
      },
    };
    const customerBlocking = {
      applyAutoBlockFromFinancials: jest.fn().mockResolvedValue({
        id: customerId,
        isBlocked: false,
        blockReason: null,
        blockedAt: null,
      }),
    };
    return {
      service: new Customer360Service(prisma as never, customerBlocking as never),
      prisma,
      customerBlocking,
    };
  }

  it('CALL_CENTER receives score, insights, alerts', async () => {
    const { service } = makeService();
    const user: JwtUser = {
      userId: 'u1',
      role: 'CALL_CENTER',
      branchId: null,
      linkedCustomerId: null,
    };
    const res = await service.get360(customerId, user);
    expect('score' in res && res.score && typeof res.score === 'object').toBe(true);
    expect('insights' in res && res.insights && typeof res.insights === 'object').toBe(true);
    expect('alerts' in res && Array.isArray((res as { alerts: unknown[] }).alerts)).toBe(true);
  });

  it('CUSTOMER receives null score/insights and matching financials', async () => {
    const { service } = makeService();
    const user: JwtUser = {
      userId: 'u1',
      role: 'CUSTOMER',
      branchId: null,
      linkedCustomerId: customerId,
    };
    const res = await service.get360(customerId, user);
    expect(res.score).toBeNull();
    expect(res.insights).toBeNull();
    expect('alerts' in res).toBe(false);
    expect(res.statement.financials.consumedKd).toBe('3.0000');
    // V20.4 — totalPaymentsKd sourced from DebtLedger (removed); now 0.
    expect(res.statement.financials.totalPaymentsKd).toBe('0.0000');
    expect(res.statement.financials.subscriptionValueKd).toBe('10.0000');
    expect(res.subscription.subscriptionValueKd).toBe('10.0000');
    // V23.2 — `totalDueKd` removed from the wire DTO. The canonical
    // receivable replaces it for every assertion across the codebase.
    // V23.3 — `canonicalDebtKd` is derived from
    // `computeCanonicalCustomerDebt` (per-open-invoice remaining
    // balance + customer RESIDUAL FIFO), NOT the legacy
    // `totalInvoices − totalPayments` formula. The ledger PAYMENT row
    // in this fixture is unattached (no `orderId`), so the open UNPAID
    // order's full `totalPrice` of 3.0000 is the canonical receivable.
    expect(res.statement.financials.canonicalDebtKd).toBe('3.0000');
    // V23.3 — `friendlySummary` lives only on the `Customer360SanitizedDto`
    // arm of the union returned by `get360`; CUSTOMER role always lands
    // on that arm, so narrow the union explicitly to satisfy `tsc`.
    expect('friendlySummary' in res ? res.friendlySummary : '').toContain(
      '3.0000',
    );
  });

  it('CUSTOMER cannot access another customer id', async () => {
    const { service } = makeService();
    const user: JwtUser = {
      userId: 'u1',
      role: 'CUSTOMER',
      branchId: null,
      linkedCustomerId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    };
    await expect(service.get360(customerId, user)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('MANAGER is forbidden', async () => {
    const { service } = makeService();
    await expect(
      service.get360(customerId, {
        userId: 'u',
        role: 'MANAGER',
        branchId: null,
        linkedCustomerId: null,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
