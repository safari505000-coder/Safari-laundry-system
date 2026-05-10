import { CashStatus, OrderStatus, PosPaymentMethod, Prisma } from '@prisma/client';
import { PaymentsService } from './payments.service';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const BUNDLE_ID = '22222222-2222-4222-8222-222222222222';
const CUSTOMER_ID = '33333333-3333-4333-8333-333333333333';
const DRIVER_ID = '44444444-4444-4444-8444-444444444444';
const TRANS_ID = 'upayments-track-v2';

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    order: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    posPaymentBundle: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ branchId: 'branch-1' }),
      findFirst: jest.fn().mockResolvedValue({ id: DRIVER_ID }),
    },
    customerWallet: {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce({ debt: new Prisma.Decimal('10.0000') })
        .mockResolvedValue({ debt: new Prisma.Decimal('0.0000') }),
    },
    transactionHistory: {
      create: jest.fn(),
    },
    ...overrides,
  } as any;
}

function makePrisma(tx = makeTx()) {
  return {
    $transaction: jest.fn(async (fn: (txArg: unknown) => Promise<unknown>) =>
      fn(tx),
    ),
    order: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    posPaymentBundle: {
      findUnique: jest.fn(),
    },
  } as any;
}

function makeService(tx = makeTx()) {
  const prisma = makePrisma(tx);
  const customerLedger = {
    applyOrderWalletSettlementForCompletedOrder: jest.fn().mockResolvedValue(undefined),
  };
  const generalLedger = { append: jest.fn().mockResolvedValue(undefined) };
  const inventory = { applyOrderStockDecrement: jest.fn().mockResolvedValue(undefined) };
  const whatsappQueue = { enqueuePaymentConfirmed: jest.fn() };
  const discordAlerts = { enqueue: jest.fn() };
  // V23.3 — `PaymentsService` constructor gained an `AuditLogsService`
  // dependency (and an optional `MetricsService`) after V21.x. Stub
  // the new params so the spec compiles and behaves identically.
  const auditLogs = { append: jest.fn().mockResolvedValue(undefined) };
  const service = new PaymentsService(
    prisma,
    customerLedger as any,
    generalLedger as any,
    inventory as any,
    whatsappQueue as any,
    discordAlerts as any,
    auditLogs as any,
  );
  jest.spyOn(service as any, 'emitPaymentConfirmedNotify').mockImplementation(() => undefined);
  return { service, prisma, tx, customerLedger, generalLedger, inventory, discordAlerts };
}

function pendingOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    status: OrderStatus.PENDING,
    cashStatus: CashStatus.UNPAID,
    walletSettledAt: null,
    customerId: CUSTOMER_ID,
    totalPrice: new Prisma.Decimal('10.0000'),
    posPaymentMethod: PosPaymentMethod.PAYMENT_LINK,
    driverId: DRIVER_ID,
    posPaymentBundleId: null,
    posGatewayTrackId: TRANS_ID,
    posGatewayMetadata: null,
    ...overrides,
  };
}

function gatewayMetadata(amount = '10.000') {
  return {
    provider: 'upayments',
    trackId: TRANS_ID,
    result: 'CAPTURED',
    amount,
    currency: 'KWD',
  } as never;
}

function gatewaySuccess(amount = '10.000') {
  return {
    ok: true,
    data: {
      result: 'CAPTURED',
      amount,
      currency: 'KWD',
      order: { id: ORDER_ID },
      transactionId: 'txn-1',
      paymentId: 'pay-1',
    },
    raw: { status: true },
  };
}

describe('PaymentsService payment safety', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('is idempotent: second finalize is duplicate_noop with no duplicate side effects', async () => {
    const tx = makeTx();
    tx.order.findUnique.mockResolvedValue(pendingOrder());
    tx.order.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const { service, prisma, customerLedger, generalLedger, inventory, discordAlerts } =
      makeService(tx);
    prisma.posPaymentBundle.findUnique.mockResolvedValue(null);

    await service.finalizePaidOrderFromGateway(ORDER_ID, gatewayMetadata());
    await service.finalizePaidOrderFromGateway(ORDER_ID, gatewayMetadata());

    expect(tx.order.updateMany).toHaveBeenCalledTimes(2);
    expect(customerLedger.applyOrderWalletSettlementForCompletedOrder).toHaveBeenCalledTimes(1);
    expect(generalLedger.append).toHaveBeenCalledTimes(1);
    expect(inventory.applyOrderStockDecrement).toHaveBeenCalledTimes(1);
  });

  it('guarantees CAPTURED finalization completes order, settles wallet, and creates transaction history', async () => {
    const tx = makeTx();
    tx.order.findUnique.mockResolvedValue(pendingOrder());
    tx.order.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const { service, prisma, customerLedger, discordAlerts } = makeService(tx);
    prisma.posPaymentBundle.findUnique.mockResolvedValue(null);
    customerLedger.applyOrderWalletSettlementForCompletedOrder.mockImplementation(
      async (ledgerTx: any, orderId: string) => {
        await ledgerTx.transactionHistory.create({
          data: { orderId },
        });
        await ledgerTx.order.updateMany({
          where: { id: orderId, walletSettledAt: null },
          data: { walletSettledAt: new Date() },
        });
      },
    );

    const finalized = await service.finalizePaidOrderFromGateway(
      ORDER_ID,
      gatewayMetadata('9.000'),
    );

    expect(finalized).toBe(true);
    expect(tx.order.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          id: ORDER_ID,
          walletSettledAt: null,
          status: { not: OrderStatus.COMPLETED },
        },
        data: expect.objectContaining({
          status: OrderStatus.COMPLETED,
        }),
      }),
    );
    expect(tx.order.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: ORDER_ID, walletSettledAt: null },
        data: expect.objectContaining({ walletSettledAt: expect.any(Date) }),
      }),
    );
    expect(tx.transactionHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orderId: ORDER_ID }),
      }),
    );
    expect(customerLedger.applyOrderWalletSettlementForCompletedOrder).toHaveBeenCalledTimes(1);
    expect(discordAlerts.enqueue).toHaveBeenCalledWith(
      'finalize_success',
      expect.objectContaining({
        orderId: ORDER_ID,
        trackId: TRANS_ID,
      }),
    );
  });

  it('handles race condition: concurrent finalizes produce one set of side effects', async () => {
    const tx = makeTx();
    tx.order.findUnique.mockResolvedValue(pendingOrder());
    tx.order.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const { service, prisma, customerLedger, generalLedger, inventory, discordAlerts } =
      makeService(tx);
    prisma.posPaymentBundle.findUnique.mockResolvedValue(null);

    await Promise.all([
      service.finalizePaidOrderFromGateway(ORDER_ID, gatewayMetadata()),
      service.finalizePaidOrderFromGateway(ORDER_ID, gatewayMetadata()),
    ]);

    expect(customerLedger.applyOrderWalletSettlementForCompletedOrder).toHaveBeenCalledTimes(1);
    expect(generalLedger.append).toHaveBeenCalledTimes(1);
    expect(inventory.applyOrderStockDecrement).toHaveBeenCalledTimes(1);
  });

  it('logs CRITICAL when CAPTURED cannot claim a non-completed order', async () => {
    const tx = makeTx();
    tx.order.findUnique.mockResolvedValue(pendingOrder());
    tx.order.updateMany.mockResolvedValue({ count: 0 });
    const { service, prisma, customerLedger, generalLedger, inventory, discordAlerts } =
      makeService(tx);
    prisma.posPaymentBundle.findUnique.mockResolvedValue(null);
    const criticalLog = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined);

    const finalized = await service.finalizePaidOrderFromGateway(
      ORDER_ID,
      gatewayMetadata(),
    );

    expect(finalized).toBe(false);
    expect(criticalLog).toHaveBeenCalledWith(
      expect.stringContaining('CRITICAL captured_payment_not_finalized'),
    );
    expect(discordAlerts.enqueue).toHaveBeenCalledWith(
      'captured_payment_not_finalized',
      expect.objectContaining({
        orderId: ORDER_ID,
        trackId: TRANS_ID,
      }),
    );
    expect(customerLedger.applyOrderWalletSettlementForCompletedOrder).not.toHaveBeenCalled();
    expect(generalLedger.append).not.toHaveBeenCalled();
    expect(inventory.applyOrderStockDecrement).not.toHaveBeenCalled();
  });

  it('enqueues finalize_failed without swallowing core finalize errors', async () => {
    const tx = makeTx();
    const { service, prisma, discordAlerts } = makeService(tx);
    prisma.posPaymentBundle.findUnique.mockResolvedValue(null);
    const failure = new Error('database unavailable');
    prisma.$transaction.mockRejectedValue(failure);

    await expect(
      service.finalizePaidOrderFromGateway(ORDER_ID, gatewayMetadata()),
    ).rejects.toThrow('database unavailable');
    expect(discordAlerts.enqueue).toHaveBeenCalledWith(
      'finalize_failed',
      expect.objectContaining({
        orderId: ORDER_ID,
        trackId: TRANS_ID,
      }),
    );
  });

  it('polling success finalizes the order', async () => {
    const { service, prisma } = makeService();
    prisma.order.findUnique
      .mockResolvedValueOnce({ status: OrderStatus.PENDING, walletSettledAt: null })
      .mockResolvedValue({ status: OrderStatus.PENDING, walletSettledAt: null });
    prisma.posPaymentBundle.findUnique.mockResolvedValue(null);
    const checkPaymentStatus = jest
      .spyOn(service, 'checkPaymentStatus')
      .mockResolvedValue({ finalized: true, gatewayResult: 'CAPTURED', inquiryRaw: {} });

    (service as any).startGatewayStatusPolling(ORDER_ID, TRANS_ID);
    await Promise.resolve();
    await Promise.resolve();

    expect(checkPaymentStatus).toHaveBeenCalledTimes(1);
  });

  it('polling failure retries 3 times then stops and cleans activePollingTransIds', async () => {
    jest.useFakeTimers();
    const { service, prisma } = makeService();
    prisma.order.findUnique.mockResolvedValue({
      status: OrderStatus.PENDING,
      walletSettledAt: null,
    });
    prisma.posPaymentBundle.findUnique.mockResolvedValue(null);
    const fetchGatewayStatus = jest
      .spyOn(service, 'fetchGatewayStatus')
      .mockResolvedValue({ ok: false, data: {}, raw: { error: true } } as any);

    (service as any).startGatewayStatusPolling(ORDER_ID, TRANS_ID);
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(20_000);
    await jest.advanceTimersByTimeAsync(20_000);
    await Promise.resolve();

    expect(fetchGatewayStatus).toHaveBeenCalledTimes(3);
    expect((service as any).activePollingTransIds.has(TRANS_ID)).toBe(false);
    jest.useRealTimers();
  });

  it('duplicate polling for the same transId does not start twice', async () => {
    const { service, prisma } = makeService();
    prisma.order.findUnique.mockResolvedValue({
      status: OrderStatus.PENDING,
      walletSettledAt: null,
    });
    let resolveCheck!: (value: unknown) => void;
    const check = jest
      .spyOn(service, 'checkPaymentStatus')
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveCheck = resolve;
          }) as any,
      );

    (service as any).startGatewayStatusPolling(ORDER_ID, TRANS_ID);
    (service as any).startGatewayStatusPolling(ORDER_ID, TRANS_ID);
    await Promise.resolve();
    await Promise.resolve();

    expect(check).toHaveBeenCalledTimes(1);
    resolveCheck({ finalized: true, gatewayResult: 'CAPTURED', inquiryRaw: null });
    await Promise.resolve();
  });

  it('bundle payment with bundle amount finalizes', async () => {
    const tx = makeTx();
    tx.order.findUnique.mockResolvedValue(
      pendingOrder({
        posPaymentBundleId: BUNDLE_ID,
        totalPrice: new Prisma.Decimal('5.0000'),
      }),
    );
    tx.posPaymentBundle.findUnique.mockResolvedValue({
      totalAmountKd: new Prisma.Decimal('10.0000'),
    });
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    const { service, prisma, customerLedger } = makeService(tx);
    prisma.posPaymentBundle.findUnique.mockResolvedValue({
      orders: [{ id: ORDER_ID }],
    });

    await service.finalizePaidOrderFromGateway(BUNDLE_ID, gatewayMetadata('10.000'));

    expect(customerLedger.applyOrderWalletSettlementForCompletedOrder).toHaveBeenCalledTimes(1);
  });

  it('bundle CAPTURED payment finalizes even when amount mismatch would otherwise block it', async () => {
    const tx = makeTx();
    tx.order.findUnique.mockResolvedValue(
      pendingOrder({
        posPaymentBundleId: BUNDLE_ID,
        totalPrice: new Prisma.Decimal('5.0000'),
      }),
    );
    tx.posPaymentBundle.findUnique.mockResolvedValue({
      totalAmountKd: new Prisma.Decimal('10.0000'),
    });
    const { service, prisma, customerLedger, generalLedger, inventory } =
      makeService(tx);
    prisma.posPaymentBundle.findUnique.mockResolvedValue({
      orders: [{ id: ORDER_ID }],
    });
    tx.order.updateMany.mockResolvedValue({ count: 1 });

    const finalized = await service.finalizePaidOrderFromGateway(
      BUNDLE_ID,
      gatewayMetadata('9.000'),
    );

    expect(finalized).toBe(true);
    expect(customerLedger.applyOrderWalletSettlementForCompletedOrder).toHaveBeenCalledTimes(1);
    expect(generalLedger.append).toHaveBeenCalledTimes(1);
    expect(inventory.applyOrderStockDecrement).toHaveBeenCalledTimes(1);
  });

  it('gateway error does not finalize', async () => {
    const { service, customerLedger, generalLedger, inventory } = makeService();
    jest
      .spyOn(service, 'fetchGatewayStatus')
      .mockResolvedValue({ ok: false, data: {}, raw: { error: true } } as any);

    const result = await service.checkPaymentStatus(TRANS_ID, ORDER_ID);

    expect(result.finalized).toBe(false);
    expect(customerLedger.applyOrderWalletSettlementForCompletedOrder).not.toHaveBeenCalled();
    expect(generalLedger.append).not.toHaveBeenCalled();
    expect(inventory.applyOrderStockDecrement).not.toHaveBeenCalled();
  });

  it('invalid transId does not finalize', async () => {
    const { service, customerLedger, generalLedger, inventory } = makeService();

    const result = await service.checkPaymentStatus('bad', ORDER_ID);

    expect(result.finalized).toBe(false);
    expect(customerLedger.applyOrderWalletSettlementForCompletedOrder).not.toHaveBeenCalled();
    expect(generalLedger.append).not.toHaveBeenCalled();
    expect(inventory.applyOrderStockDecrement).not.toHaveBeenCalled();
  });

  it('CAPTURED status finalizes even when amount mismatch would otherwise leave order pending', async () => {
    const tx = makeTx();
    tx.order.findUnique.mockResolvedValue(pendingOrder());
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    const { service, prisma, customerLedger, generalLedger, inventory } =
      makeService(tx);
    jest.spyOn(service, 'fetchGatewayStatus').mockResolvedValue(gatewaySuccess('9.000') as any);
    prisma.order.findUnique.mockResolvedValue({
      id: ORDER_ID,
      totalPrice: new Prisma.Decimal('10.0000'),
      status: OrderStatus.PENDING,
      walletSettledAt: null,
      posGatewayTrackId: TRANS_ID,
    });

    const result = await service.checkPaymentStatus(TRANS_ID, ORDER_ID);

    expect(result.finalized).toBe(true);
    expect(customerLedger.applyOrderWalletSettlementForCompletedOrder).toHaveBeenCalledTimes(1);
    expect(generalLedger.append).toHaveBeenCalledTimes(1);
    expect(inventory.applyOrderStockDecrement).toHaveBeenCalledTimes(1);
  });
});
