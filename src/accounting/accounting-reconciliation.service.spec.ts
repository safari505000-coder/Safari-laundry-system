import { CashStatus, ManagerCashCustodyStatus, Prisma } from '@prisma/client';
import { AccountingReconciliationService } from './accounting-reconciliation.service';

function d(value: string) {
  return new Prisma.Decimal(value);
}

function order(
  id: string,
  amount: string,
  cashStatus = CashStatus.HANDED_OVER_TO_OFFICE,
  driverId = 'driver-1',
) {
  return {
    id,
    totalPrice: d(amount),
    driverId,
    cashStatus,
    updatedAt: new Date('2026-05-01T08:30:00.000Z'),
    driver: { id: driverId, fullName: `Driver ${driverId}`, username: driverId },
  };
}

function bag(
  id: string,
  amount: string,
  status: ManagerCashCustodyStatus,
  receivedFromDriverAt = new Date('2026-05-01T08:00:00.000Z'),
) {
  return {
    id,
    amountKd: d(amount),
    driverId: 'driver-1',
    shiftId: 'shift-1',
    depositSlipUrl:
      status === ManagerCashCustodyStatus.VERIFIED ? '/uploads/test-slip.jpg' : null,
    receivedFromDriverAt,
    slipUploadedAt:
      status === ManagerCashCustodyStatus.PENDING_DEPOSIT ? null : (
        new Date('2026-05-01T09:00:00.000Z')
      ),
    status,
    driver: { id: 'driver-1', fullName: 'Driver One', username: 'driver1' },
  };
}

function deposit(id: string, amount: string) {
  return {
    id,
    amountKd: d(amount),
    shiftId: 'shift-1',
    createdAt: new Date('2026-05-01T10:00:00.000Z'),
    verifiedAt: new Date('2026-05-01T11:00:00.000Z'),
  };
}

function serviceWith(rows: {
  orders?: unknown[];
  custodies?: unknown[];
  deposits?: unknown[];
}) {
  return serviceAndPrisma(rows).service;
}

function serviceAndPrisma(rows: {
  orders?: unknown[];
  custodies?: unknown[];
  deposits?: unknown[];
}) {
  const prisma = {
    order: { findMany: jest.fn().mockResolvedValue(rows.orders ?? []) },
    managerCashCustody: {
      findMany: jest.fn().mockResolvedValue(rows.custodies ?? []),
    },
    bankDepositLog: { findMany: jest.fn().mockResolvedValue(rows.deposits ?? []) },
  };
  return { service: new AccountingReconciliationService(prisma as never), prisma };
}

describe('AccountingReconciliationService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-02T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('marks a perfect cash flow as OK', async () => {
    const service = serviceWith({
      orders: [order('order-1', '10.0000')],
      custodies: [bag('bag-1', '10.0000', ManagerCashCustodyStatus.VERIFIED)],
      deposits: [deposit('deposit-1', '10.0000')],
    });

    const result = await service.computeCashReconciliation('2026-05-01');

    expect(result.status).toBe('OK');
    expect(result.expectedCash).toBe('10.0000');
    expect(result.differenceDriver).toBe('0.0000');
    expect(result.differenceBank).toBe('0.0000');
    expect(result.accountability).toEqual([]);
  });

  it('does not create a false mismatch for orders outside a closed custody flow', async () => {
    const service = serviceWith({
      orders: [order('order-1', '10.0000', CashStatus.PAID_TO_DRIVER)],
      custodies: [],
      deposits: [],
    });

    const result = await service.computeCashReconciliation('2026-05-01');

    expect(result.reconciliationMode).toBe('flow_based');
    expect(result.status).toBe('OK');
    expect(result.expectedCash).toBe('0.0000');
    expect(result.accountability).toEqual([]);
  });

  it('assigns responsibility to BRANCH when custody amount differs from linked orders', async () => {
    const service = serviceWith({
      orders: [order('order-1', '10.0000')],
      custodies: [bag('bag-1', '5.0000', ManagerCashCustodyStatus.PENDING_DEPOSIT)],
      deposits: [],
    });

    const result = await service.computeCashReconciliation('2026-05-01');

    expect(result.differenceDriver).toBe('0.0000');
    expect(result.differenceBranch).toBe('5.0000');
    expect(result.accountability[0]).toMatchObject({
      responsible: 'BRANCH',
      amount: '5.0000',
    });
  });

  it('flags a missing deposit', async () => {
    const service = serviceWith({
      orders: [order('order-1', '8.0000')],
      custodies: [bag('bag-1', '8.0000', ManagerCashCustodyStatus.AWAITING_VERIFICATION)],
      deposits: [],
    });

    const result = await service.computeCashReconciliation('2026-05-01');

    expect(result.differenceBank).toBe('8.0000');
    expect(result.alerts.some((a) => a.type === 'PARTIAL_DEPOSIT')).toBe(true);
  });

  it('flags a partial deposit', async () => {
    const service = serviceWith({
      orders: [order('order-1', '10.0000')],
      custodies: [bag('bag-1', '10.0000', ManagerCashCustodyStatus.VERIFIED)],
      deposits: [deposit('deposit-1', '4.0000')],
    });

    const result = await service.computeCashReconciliation('2026-05-01');

    expect(result.differenceBank).toBe('6.0000');
    expect(result.status).toBe('MISMATCH');
  });

  it('flags verified custody with a slip but no bank deposit log', async () => {
    const service = serviceWith({
      orders: [order('order-1', '10.0000')],
      custodies: [bag('bag-1', '10.0000', ManagerCashCustodyStatus.VERIFIED)],
      deposits: [],
    });

    const result = await service.computeCashReconciliation('2026-05-01');

    expect(result.alerts.some((a) => a.type === 'DEPOSIT_NOT_REGISTERED')).toBe(
      true,
    );
  });

  it('flags delayed deposits after 24 hours', async () => {
    const service = serviceWith({
      orders: [order('order-1', '2.0000')],
      custodies: [
        bag(
          'bag-1',
          '2.0000',
          ManagerCashCustodyStatus.PENDING_DEPOSIT,
          new Date('2026-05-01T06:00:00.000Z'),
        ),
      ],
      deposits: [],
    });

    const result = await service.computeCashReconciliation('2026-05-01');

    expect(result.alerts.some((a) => a.type === 'DELAYED_DEPOSIT')).toBe(true);
    expect(result.accountability[0]?.delayHours).toBeGreaterThanOrEqual(24);
  });

  it('does not add scope filters when scope is ALL', async () => {
    const { service, prisma } = serviceAndPrisma({
      custodies: [bag('bag-1', '1.0000', ManagerCashCustodyStatus.VERIFIED)],
    });

    await service.computeCashReconciliation('2026-05-01', { scopeType: 'ALL' });

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({
          driverId: expect.any(String),
          driver: expect.any(Object),
        }),
      }),
    );
  });

  it('filters branch scope by every driver in that branch', async () => {
    const { service, prisma } = serviceAndPrisma({
      custodies: [bag('bag-1', '1.0000', ManagerCashCustodyStatus.VERIFIED)],
    });

    await service.computeCashReconciliation('2026-05-01', {
      scopeType: 'BRANCH',
      branchId: 'branch-1',
    });

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          driver: { branchId: 'branch-1' },
        }),
      }),
    );
    expect(prisma.managerCashCustody.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branchId: 'branch-1' }),
      }),
    );
  });

  it('filters driver scope to one driver only', async () => {
    const { service, prisma } = serviceAndPrisma({
      custodies: [bag('bag-1', '1.0000', ManagerCashCustodyStatus.VERIFIED)],
    });

    await service.computeCashReconciliation('2026-05-01', {
      scopeType: 'DRIVER',
      driverId: 'driver-1',
    });

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ driverId: 'driver-1' }),
      }),
    );
    expect(prisma.managerCashCustody.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ driverId: 'driver-1' }),
      }),
    );
  });
});
