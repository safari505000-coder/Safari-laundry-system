import { ForbiddenException } from '@nestjs/common';
import { CashStatus, OrderStatus, PosPaymentMethod } from '@prisma/client';
import { Customer360Service } from './customer-360.service';
import type { JwtUser } from '../auth/decorators/current-user.decorator';

describe('Customer360Service', () => {
  const customerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  function makeService(overrides?: Partial<{
    findUniqueCustomer: unknown;
    findManyOrders: unknown[];
    findManyLedger: unknown[];
    findFirstSub: unknown;
    findWallet: unknown;
    findManySubs: unknown[];
    aggregateFeedback: unknown;
  }>) {
    const prisma = {
      customer: {
        findUnique: jest.fn().mockResolvedValue(
          overrides?.findUniqueCustomer ?? {
            id: customerId,
            displayName: 'X',
            phone: '500',
            phone2: null,
          },
        ),
      },
      order: {
        findMany: jest.fn().mockResolvedValue(
          overrides?.findManyOrders ?? [
            {
              status: OrderStatus.COMPLETED,
              totalPrice: { toString: () => '3' },
              cashStatus: CashStatus.UNPAID,
              posPaymentMethod: PosPaymentMethod.ONLINE,
            },
          ],
        ),
      },
      debtLedgerEntry: {
        findMany: jest.fn().mockResolvedValue(
          overrides?.findManyLedger ?? [
            {
              source: 'PAYMENT',
              amount: { toString: () => '1' },
            },
          ],
        ),
      },
      customerSubscription: {
        findFirst: jest.fn().mockResolvedValue(
          overrides?.findFirstSub ?? {
            id: 'sub-1',
            planActualBalanceSnapshot: { toString: () => '10' },
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
    expect(res.statement.financials.totalPaymentsKd).toBe('1.0000');
    expect(res.statement.financials.subscriptionValueKd).toBe('10.0000');
    expect(res.subscription.subscriptionValueKd).toBe('10.0000');
    expect(res.statement.financials.totalDueKd).toBe('2.0000');
    expect(res.friendlySummary).toContain('3.0000');
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
