import { EventEmitter2 } from '@nestjs/event-emitter';
import { CashStatus, OrderStatus, PosPaymentMethod, Prisma, ServiceType } from '@prisma/client';
import { OrdersService } from './orders.service';

const DRIVER_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const ORDER_ID = '33333333-3333-4333-8333-333333333333';

function orderDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    customerId: CUSTOMER_ID,
    driverId: DRIVER_ID,
    serviceType: ServiceType.NORMAL,
    totalPrice: new Prisma.Decimal('25.0000'),
    status: OrderStatus.PENDING,
    cashStatus: CashStatus.UNPAID,
    walletSettledAt: null,
    posPaymentMethod: PosPaymentMethod.PAYMENT_LINK,
    createdAt: new Date('2026-05-17T00:00:00.000Z'),
    completedAt: null,
    dispatchId: null,
    customer: {
      id: CUSTOMER_ID,
      phone: '51234567',
      phone2: null,
      displayName: 'Test Customer',
    },
    lineItems: [],
    ...overrides,
  };
}

function makeService() {
  const created = orderDetail();
  const tx = {
    customer: {
      findUnique: jest.fn().mockResolvedValue({
        id: CUSTOMER_ID,
        phone: '51234567',
        originBranchId: null,
      }),
    },
    order: {
      create: jest.fn().mockResolvedValue(created),
      findUniqueOrThrow: jest.fn().mockResolvedValue(created),
    },
    customerWallet: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: DRIVER_ID, branchId: null }),
    },
    laundryPriceListItem: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: '44444444-4444-4444-8444-444444444444',
          nameAr: 'جاكيت',
          manualEntry: false,
          priceNormal: new Prisma.Decimal('12.3750'),
          priceUrgent: new Prisma.Decimal('15.0000'),
          pricePressOnly: new Prisma.Decimal('5.0000'),
          priceUrgentPress: new Prisma.Decimal('6.0000'),
          branchOverrides: [],
        },
      ]),
    },
  };
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: DRIVER_ID,
        safariRole: 'DRIVER',
        branchId: null,
      }),
    },
    customer: {
      findUnique: jest.fn().mockResolvedValue({
        id: CUSTOMER_ID,
        phone: '51234567',
        originBranchId: null,
      }),
    },
    order: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(created),
      update: jest.fn().mockResolvedValue(created),
    },
    $transaction: jest.fn(async (fn: (txArg: unknown) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const customerLedger = {
    registerPendingPaymentLinkReceivableTx: jest.fn().mockResolvedValue(undefined),
    applyOrderWalletSettlementForCompletedOrder: jest.fn().mockResolvedValue(undefined),
    emitFinancialEvent: jest.fn(),
  };
  const payments = {
    ensurePaymentLinkForUnpaidOrder: jest.fn().mockResolvedValue({
      url: 'https://sandbox.upayments.com/session/test',
      trackId: 'track-1',
    }),
    createPaymentLink: jest.fn().mockResolvedValue({
      url: 'https://sandbox.upayments.com/session/test',
      trackId: 'track-1',
    }),
    schedulePaymentConfirmedCustomerNotify: jest.fn(),
  };
  const service = new OrdersService(
    prisma as never,
    customerLedger as never,
    payments as never,
    {
      deliverInvoiceIssuedNow: jest.fn().mockResolvedValue(undefined),
      sendOrderInvoice: jest.fn().mockResolvedValue(undefined),
    } as never,
    { append: jest.fn().mockResolvedValue(undefined) } as never,
    { stampOrderSerial: jest.fn().mockResolvedValue(1001) } as never,
    { applyOrderStockDecrement: jest.fn().mockResolvedValue(undefined) } as never,
    { autoBlockIfNeeded: jest.fn().mockResolvedValue(undefined) } as never,
    {
      sendPosInvoiceIssued: jest.fn().mockResolvedValue(undefined),
      sendPosBundleInvoiceIssued: jest.fn().mockResolvedValue(undefined),
    } as never,
    {} as never,
    { assertNotBlocked: jest.fn().mockResolvedValue(undefined) } as never,
    { logFinancialEvent: jest.fn().mockResolvedValue(undefined) } as never,
    new EventEmitter2(),
    {} as never,
  );
  return { service, prisma, tx, customerLedger };
}

function makePricedPosService() {
  const created = { id: ORDER_ID, driverId: DRIVER_ID };
  const detail = orderDetail({
    status: OrderStatus.COMPLETED,
    cashStatus: CashStatus.PAID_TO_DRIVER,
    posPaymentMethod: PosPaymentMethod.CASH,
    totalPrice: new Prisma.Decimal('3.7500'),
  });
  const tx = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: DRIVER_ID, branchId: null }),
    },
    laundryPriceListItem: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: '44444444-4444-4444-8444-444444444444',
          nameAr: 'جاكيت',
          manualEntry: false,
          priceNormal: new Prisma.Decimal('1.7500'),
          priceUrgent: new Prisma.Decimal('2.2500'),
          pricePressOnly: new Prisma.Decimal('0.7500'),
          priceUrgentPress: new Prisma.Decimal('1.2500'),
          branchOverrides: [],
        },
      ]),
    },
    customer: {
      findUnique: jest.fn().mockResolvedValue({
        id: CUSTOMER_ID,
        phone: '51234567',
        phone2: null,
      }),
    },
    customerWallet: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    order: {
      create: jest.fn().mockResolvedValue(created),
    },
  };
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: DRIVER_ID,
        safariRole: 'DRIVER',
        branchId: null,
      }),
    },
    order: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(detail),
      update: jest.fn().mockResolvedValue(detail),
    },
    $transaction: jest.fn(async (fn: (txArg: unknown) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const customerLedger = {
    registerPendingPaymentLinkReceivableTx: jest.fn().mockResolvedValue(undefined),
    applyOrderWalletSettlementForCompletedOrder: jest.fn().mockResolvedValue(undefined),
    emitFinancialEvent: jest.fn(),
  };
  const generalLedger = { append: jest.fn().mockResolvedValue(undefined) };
  const service = new OrdersService(
    prisma as never,
    customerLedger as never,
    {
      createPaymentLink: jest.fn(),
      schedulePaymentConfirmedCustomerNotify: jest.fn(),
    } as never,
    {
      deliverInvoiceIssuedNow: jest.fn().mockResolvedValue(undefined),
      sendOrderInvoice: jest.fn().mockResolvedValue(undefined),
    } as never,
    generalLedger as never,
    { stampOrderSerial: jest.fn().mockResolvedValue(1001) } as never,
    { applyOrderStockDecrement: jest.fn().mockResolvedValue(undefined) } as never,
    { autoBlockIfNeeded: jest.fn().mockResolvedValue(undefined) } as never,
    {
      sendPosInvoiceIssued: jest.fn().mockResolvedValue(undefined),
      sendPosBundleInvoiceIssued: jest.fn().mockResolvedValue(undefined),
    } as never,
    {} as never,
    { assertNotBlocked: jest.fn().mockResolvedValue(undefined) } as never,
    { logFinancialEvent: jest.fn().mockResolvedValue(undefined) } as never,
    new EventEmitter2(),
    {} as never,
  );
  return { service, tx, customerLedger, generalLedger };
}

describe('OrdersService PAYMENT_LINK immediate debt', () => {
  let prevFlag: string | undefined;

  beforeEach(() => {
    prevFlag = process.env.PAYMENT_LINK_IMMEDIATE_DEBT;
    process.env.PAYMENT_LINK_IMMEDIATE_DEBT = 'true';
  });

  afterEach(() => {
    if (prevFlag === undefined) delete process.env.PAYMENT_LINK_IMMEDIATE_DEBT;
    else process.env.PAYMENT_LINK_IMMEDIATE_DEBT = prevFlag;
  });

  it('createQuick registers PAYMENT_LINK debt after creating the order', async () => {
    const { service, customerLedger, tx } = makeService();

    await service.createQuick(DRIVER_ID, {
      customerPhone: '51234567',
      customerId: CUSTOMER_ID,
      totalPrice: 25,
      posPaymentMethod: PosPaymentMethod.PAYMENT_LINK,
    });

    expect(tx.order.create).toHaveBeenCalled();
    expect(customerLedger.registerPendingPaymentLinkReceivableTx).toHaveBeenCalledWith(
      tx,
      ORDER_ID,
      CUSTOMER_ID,
      new Prisma.Decimal('25.0000'),
    );
  });

  it('posCheckout hosted ONLINE branch registers debt and leaves wallet unsettled', async () => {
    const { service, prisma, tx, customerLedger } = makeService();
    tx.order.create.mockResolvedValue({
      id: ORDER_ID,
      driverId: DRIVER_ID,
    });
    prisma.order.findUniqueOrThrow.mockResolvedValue(
      orderDetail({ posPaymentMethod: PosPaymentMethod.ONLINE }),
    );

    const detail = await service.posCheckout(DRIVER_ID, {
      customerPhone: '51234567',
      customerId: CUSTOMER_ID,
      totalPrice: 25,
      posPaymentMethod: PosPaymentMethod.ONLINE,
      lineItems: [
        {
          laundryPriceListItemId: '44444444-4444-4444-8444-444444444444',
          posServiceKey: 'NORMAL',
          quantity: 2,
          unitPrice: 0.001,
        },
      ],
    });

    expect(customerLedger.registerPendingPaymentLinkReceivableTx).toHaveBeenCalledWith(
      tx,
      ORDER_ID,
      CUSTOMER_ID,
      new Prisma.Decimal('25.0000'),
    );
    expect(customerLedger.applyOrderWalletSettlementForCompletedOrder).not.toHaveBeenCalled();
    expect(detail.status).toBe(OrderStatus.PENDING);
    expect(detail.cashStatus).toBe(CashStatus.UNPAID);
    expect(detail.walletSettledAt).toBeNull();
  });

  it('posCheckout prices catalog lines on the server and ignores client totals', async () => {
    const { service, tx, customerLedger, generalLedger } = makePricedPosService();

    await service.posCheckout(DRIVER_ID, {
      customerPhone: '51234567',
      customerId: CUSTOMER_ID,
      totalPrice: 0.001,
      posPaymentMethod: PosPaymentMethod.CASH,
      lineItems: [
        {
          laundryPriceListItemId: '44444444-4444-4444-8444-444444444444',
          posServiceKey: 'NORMAL',
          label: 'tampered',
          quantity: 2,
          unitPrice: 0.001,
        },
      ],
    });

    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalPrice: new Prisma.Decimal('3.7500'),
          lineItems: {
            create: [
              expect.objectContaining({
                label: 'جاكيت — غسيل عادي',
                quantity: '2.0000',
                unitPrice: '1.7500',
              }),
              expect.objectContaining({
                label: 'توصيل داخل المنطقة',
                quantity: '1.0000',
                unitPrice: '0.2500',
              }),
            ],
          },
        }),
      }),
    );
    expect(
      customerLedger.applyOrderWalletSettlementForCompletedOrder,
    ).toHaveBeenCalledWith(
      tx,
      ORDER_ID,
      DRIVER_ID,
      expect.objectContaining({ totalPrice: new Prisma.Decimal('3.7500') }),
    );
    expect(generalLedger.append).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ amount: new Prisma.Decimal('3.7500') }),
    );
  });
});
