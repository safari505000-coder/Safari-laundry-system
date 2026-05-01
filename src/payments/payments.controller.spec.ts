import { OrderStatus, Prisma } from '@prisma/client';
import { PaymentsController } from './payments.controller';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const TRANS_ID = 'upayments-track-v2';

function makeController() {
  const paymentsService = {
    allowDevMockCallback: jest.fn().mockReturnValue(false),
    normalizeCallbackStatus: jest.fn((status: string) => {
      const s = String(status ?? '').toLowerCase();
      return s === 'captured' || s === 'success' ? 'success' : 'failed';
    }),
    fetchGatewayStatus: jest.fn(),
    findOrderByTrackId: jest.fn(),
    finalizePaidOrderFromGateway: jest.fn().mockResolvedValue(undefined),
    verifyIntegratedCallback: jest.fn().mockReturnValue(false),
  };
  const prisma = {
    order: {
      findUnique: jest.fn(),
    },
  };
  const jwt = { signAsync: jest.fn() };
  const controller = new PaymentsController(
    paymentsService as any,
    prisma as any,
    jwt as any,
  );
  return { controller, paymentsService, prisma };
}

function gatewaySuccess(amount = '10.000') {
  return {
    ok: true,
    data: {
      result: 'CAPTURED',
      amount,
      order: { id: ORDER_ID },
      transactionId: 'txn-1',
      paymentId: 'pay-1',
    },
    raw: { status: true },
  };
}

describe('PaymentsController callback webhook safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('finalizes a verified webhook once', async () => {
    const { controller, paymentsService, prisma } = makeController();
    paymentsService.fetchGatewayStatus.mockResolvedValue(gatewaySuccess());
    paymentsService.findOrderByTrackId.mockResolvedValue(ORDER_ID);
    prisma.order.findUnique.mockResolvedValue({
      id: ORDER_ID,
      status: OrderStatus.PENDING,
      walletSettledAt: null,
      totalPrice: new Prisma.Decimal('10.0000'),
    });

    const result = await controller.callback({
      trans_id: TRANS_ID,
      result: 'CAPTURED',
      orderId: ORDER_ID,
      amount: '10.000',
    } as any);

    expect(result.outcome).toBe('success');
    expect(paymentsService.finalizePaidOrderFromGateway).toHaveBeenCalledTimes(1);
    expect(paymentsService.finalizePaidOrderFromGateway).toHaveBeenCalledWith(
      ORDER_ID,
      expect.objectContaining({
        provider: 'upayments',
        trackId: TRANS_ID,
        amount: '10.000',
      }),
    );
  });

  it('does not finalize a forged webhook when gateway inquiry fails', async () => {
    const { controller, paymentsService, prisma } = makeController();
    paymentsService.fetchGatewayStatus.mockResolvedValue({
      ok: false,
      data: {},
      raw: { error: true },
    });
    paymentsService.findOrderByTrackId.mockResolvedValue(ORDER_ID);
    prisma.order.findUnique.mockResolvedValue({
      id: ORDER_ID,
      status: OrderStatus.PENDING,
      walletSettledAt: null,
      totalPrice: new Prisma.Decimal('10.0000'),
    });

    const result = await controller.callback({
      trans_id: TRANS_ID,
      result: 'CAPTURED',
      orderId: ORDER_ID,
      amount: '10.000',
    } as any);

    expect(result.outcome).toBe('failed');
    expect(paymentsService.finalizePaidOrderFromGateway).not.toHaveBeenCalled();
  });

  it('does not finalize duplicate webhook when order is already paid', async () => {
    const { controller, paymentsService, prisma } = makeController();
    paymentsService.fetchGatewayStatus.mockResolvedValue(gatewaySuccess());
    paymentsService.findOrderByTrackId.mockResolvedValue(ORDER_ID);
    prisma.order.findUnique.mockResolvedValue({
      id: ORDER_ID,
      status: OrderStatus.COMPLETED,
      walletSettledAt: new Date(),
      totalPrice: new Prisma.Decimal('10.0000'),
    });

    const result = await controller.callback({
      trans_id: TRANS_ID,
      result: 'CAPTURED',
      orderId: ORDER_ID,
      amount: '10.000',
    } as any);

    expect(result.outcome).toBe('success');
    expect(paymentsService.finalizePaidOrderFromGateway).not.toHaveBeenCalled();
  });

  it('does not trust body success without gateway verification', async () => {
    const { controller, paymentsService, prisma } = makeController();
    paymentsService.fetchGatewayStatus.mockResolvedValue({
      ok: true,
      data: {
        result: 'DECLINED',
        amount: '10.000',
        order: { id: ORDER_ID },
      },
      raw: { status: true },
    });
    paymentsService.findOrderByTrackId.mockResolvedValue(ORDER_ID);
    prisma.order.findUnique.mockResolvedValue({
      id: ORDER_ID,
      status: OrderStatus.PENDING,
      walletSettledAt: null,
      totalPrice: new Prisma.Decimal('10.0000'),
    });

    const result = await controller.callback({
      trans_id: TRANS_ID,
      status: 'success',
      orderId: ORDER_ID,
      amount: '10.000',
    } as any);

    expect(result.outcome).toBe('failed');
    expect(paymentsService.finalizePaidOrderFromGateway).not.toHaveBeenCalled();
  });

  it('does not finalize when gateway amount mismatches the order', async () => {
    const { controller, paymentsService, prisma } = makeController();
    paymentsService.fetchGatewayStatus.mockResolvedValue(gatewaySuccess('9.000'));
    paymentsService.findOrderByTrackId.mockResolvedValue(ORDER_ID);
    prisma.order.findUnique.mockResolvedValue({
      id: ORDER_ID,
      status: OrderStatus.PENDING,
      walletSettledAt: null,
      totalPrice: new Prisma.Decimal('10.0000'),
    });

    const result = await controller.callback({
      trans_id: TRANS_ID,
      result: 'CAPTURED',
      orderId: ORDER_ID,
      amount: '10.000',
    } as any);

    expect(result.outcome).toBe('success');
    expect(result.reason).toBe('amount-mismatch');
    expect(paymentsService.finalizePaidOrderFromGateway).not.toHaveBeenCalled();
  });
});
