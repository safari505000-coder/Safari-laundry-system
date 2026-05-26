import {
  CashStatus,
  OrderStatus,
  PosPaymentMethod,
  Prisma,
} from '@prisma/client';
import {
  computeOrderRemainingBalancesBatch,
  INVOICE_REMAINING_TOLERANCE_KD,
} from '../finance/debt-customer-aggregates.util';
import { InvoicePaymentStatusService } from '../finance/invoice-payment-status.service';
import { PrismaService } from '../prisma/prisma.service';

const JOURNAL_INVOICE_SOURCES = ['ORDER_INVOICE', 'INVOICE'] as const;

type OrderRow = {
  id: string;
  status: OrderStatus;
  cashStatus: CashStatus;
  posPaymentMethod: PosPaymentMethod;
  totalPrice: Prisma.Decimal;
  invoiceNumber: string | null;
  serialNumber: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

export type CustomerPortalPayableOrder = {
  id: string;
  status: OrderStatus;
  cashStatus: CashStatus;
  posPaymentMethod: PosPaymentMethod;
  totalAmountKd: string;
  paidAmountKd: string;
  remainingAmountKd: string;
  paymentStatus: ReturnType<
    InvoicePaymentStatusService['statusFromRemaining']
  >;
  invoiceNumber: string | null;
  serialNumber: string | null;
  createdAtIso: string;
  completedAtIso: string | null;
};

async function discoverOrderIds(
  prisma: PrismaService,
  customerId: string,
): Promise<string[]> {
  const journalRows = await prisma.journalEntry.findMany({
    where: {
      customerId,
      orderId: { not: null },
      source: { in: [...JOURNAL_INVOICE_SOURCES] },
    },
    distinct: ['orderId'],
    select: { orderId: true },
    orderBy: { createdAt: 'desc' },
    take: 150,
  });
  const fromJournal = journalRows
    .map((row) => row.orderId)
    .filter((id): id is string => !!id);

  if (fromJournal.length > 0) {
    return fromJournal;
  }

  const legacyRows = await prisma.order.findMany({
    where: {
      customerId,
      status: { not: OrderStatus.CANCELED },
    },
    orderBy: { createdAt: 'desc' },
    take: 150,
    select: { id: true },
  });
  return legacyRows.map((row) => row.id);
}

function filterOpenOrderIds(
  orderIds: string[],
  remainingByOrder: Map<string, Prisma.Decimal>,
  ordersById: Map<string, OrderRow>,
): string[] {
  const tolerance = new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD);
  return orderIds.filter((orderId) => {
    const order = ordersById.get(orderId);
    if (!order) return false;
    const remaining =
      remainingByOrder.get(orderId) ??
      new Prisma.Decimal(order.totalPrice.toString());
    if (remaining.greaterThan(tolerance)) {
      return true;
    }
    return (
      order.status === OrderStatus.PENDING &&
      order.cashStatus === CashStatus.UNPAID &&
      new Prisma.Decimal(order.totalPrice.toString()).greaterThan(tolerance)
    );
  });
}

export async function listPayableOrdersForCustomer(
  prisma: PrismaService,
  invoicePaymentStatus: InvoicePaymentStatusService,
  customerId: string,
): Promise<CustomerPortalPayableOrder[]> {
  const candidateIds = await discoverOrderIds(prisma, customerId);
  if (candidateIds.length === 0) {
    return [];
  }

  const orders = await prisma.order.findMany({
    where: {
      id: { in: candidateIds },
      customerId,
      status: { not: OrderStatus.CANCELED },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      cashStatus: true,
      posPaymentMethod: true,
      totalPrice: true,
      invoiceNumber: true,
      serialNumber: true,
      createdAt: true,
      completedAt: true,
    },
  });
  const ordersById = new Map(orders.map((order) => [order.id, order]));

  const remainingByOrder = await computeOrderRemainingBalancesBatch(
    prisma,
    orders.map((row) => row.id),
  );

  let openOrderIds = filterOpenOrderIds(
    orders.map((row) => row.id),
    remainingByOrder,
    ordersById,
  );

  if (openOrderIds.length === 0) {
    const allRows = await prisma.order.findMany({
      where: {
        customerId,
        status: { not: OrderStatus.CANCELED },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        status: true,
        cashStatus: true,
        posPaymentMethod: true,
        totalPrice: true,
        invoiceNumber: true,
        serialNumber: true,
        createdAt: true,
        completedAt: true,
      },
    });
    for (const row of allRows) {
      ordersById.set(row.id, row);
    }
    const allRemaining = await computeOrderRemainingBalancesBatch(
      prisma,
      allRows.map((row) => row.id),
    );
    openOrderIds = filterOpenOrderIds(
      allRows.map((row) => row.id),
      allRemaining,
      ordersById,
    );
    for (const [orderId, remaining] of allRemaining) {
      remainingByOrder.set(orderId, remaining);
    }
  }

  const paymentRows = await Promise.all(
    openOrderIds.map((orderId) =>
      invoicePaymentStatus.derivePaymentStatus(orderId),
    ),
  );
  const paymentByOrderId = new Map(
    paymentRows.map((row) => [row.orderId, row]),
  );

  return openOrderIds
    .map((orderId) => {
      const order = ordersById.get(orderId);
      if (!order) return null;
      const payment = paymentByOrderId.get(orderId)!;
      const batchRemaining =
        remainingByOrder.get(orderId) ??
        new Prisma.Decimal(payment.remainingAmountKd);
      const totalKd = new Prisma.Decimal(payment.totalAmountKd);
      const paidKd = totalKd.sub(batchRemaining);
      return {
        id: order.id,
        status: order.status,
        cashStatus: order.cashStatus,
        posPaymentMethod: order.posPaymentMethod,
        totalAmountKd: payment.totalAmountKd,
        paidAmountKd: paidKd.greaterThan(0)
          ? paidKd.toFixed(4)
          : payment.paidAmountKd,
        remainingAmountKd: batchRemaining.toFixed(4),
        paymentStatus: invoicePaymentStatus.statusFromRemaining(
          totalKd,
          paidKd.greaterThan(0) ? paidKd : new Prisma.Decimal(0),
          batchRemaining,
        ),
        invoiceNumber: order.invoiceNumber,
        serialNumber: order.serialNumber,
        createdAtIso: order.createdAt.toISOString(),
        completedAtIso: order.completedAt?.toISOString() ?? null,
      };
    })
    .filter((row): row is CustomerPortalPayableOrder => row != null)
    .sort(
      (a, b) =>
        new Date(b.createdAtIso).getTime() - new Date(a.createdAtIso).getTime(),
    );
}

export async function pickPrimaryPayableOrderId(
  prisma: PrismaService,
  invoicePaymentStatus: InvoicePaymentStatusService,
  customerId: string,
): Promise<string | null> {
  const rows = await listPayableOrdersForCustomer(
    prisma,
    invoicePaymentStatus,
    customerId,
  );
  if (rows.length === 0) {
    return null;
  }
  const sorted = [...rows].sort(
    (a, b) =>
      new Date(a.createdAtIso).getTime() - new Date(b.createdAtIso).getTime(),
  );
  return sorted[0]?.id ?? null;
}
