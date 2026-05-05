import {
  AuditStatus,
  CashStatus,
  DebtSource,
  OrderStatus,
  PosPaymentMethod,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { Customer360FinancialsDto } from './customer-360.types';

type MoneyLike = number | string | { toString(): string } | null | undefined;
export type Customer360PaymentSource =
  | 'CASH'
  | 'KNET'
  | 'ONLINE'
  | 'WALLET'
  | 'SUBSCRIPTION';

const OVERPAYMENT_TOLERANCE_KD = 0.0001;

export type CustomerFinancialInput = {
  orders: Array<{
    id?: string;
    status: OrderStatus | string;
    amount?: MoneyLike;
    totalPrice?: MoneyLike;
    cashStatus?: CashStatus | string | null;
    posPaymentMethod?: PosPaymentMethod | string | null;
    paymentSource?: Customer360PaymentSource | string | null;
    subscriptionId?: string | null;
  }>;
  debtLedger: Array<{
    orderId?: string | null;
    source: DebtSource | string;
    amount: MoneyLike;
  }>;
  subscription?: {
    id?: string | null;
    value?: MoneyLike;
    planActualBalanceSnapshot?: MoneyLike;
  } | null;
};

export type CustomerFinancialEngineResult = {
  totalInvoicesKd: string;
  totalPaymentsKd: string;
  totalDueKd: string;
  consumedKd: string;
  subscriptionRemainingKd: string;
  subscription: {
    value: string;
    consumed: string;
    remaining: string;
  };
  overpaymentBalanceKd: string;
  anomalyFlags: CustomerFinancialAnomaly[];
};

export type CustomerFinancialAnomaly = {
  type:
    | 'DOUBLE_COUNT_DETECTED'
    | 'SUBSCRIPTION_SOURCE_ANOMALY'
    | 'OVERPAYMENT_DETECTED';
  orderId?: string | null;
  amountKd?: string | null;
  source?: string | null;
};

function round(n: number): number {
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.round((n + Number.EPSILON) * 10_000) / 10_000;
}

function fourDp(n: number): string {
  if (!Number.isFinite(n)) {
    return '0.0000';
  }
  return round(n).toFixed(4);
}

function money(value: MoneyLike): number {
  const n =
    typeof value === 'number'
      ? value
      : Number.parseFloat(value?.toString() ?? '0');
  return Number.isFinite(n) ? n : 0;
}

function assertPaymentSource(
  o: CustomerFinancialInput['orders'][number],
): Customer360PaymentSource {
  const source = o.paymentSource;
  if (
    source === 'CASH' ||
    source === 'KNET' ||
    source === 'ONLINE' ||
    source === 'WALLET' ||
    source === 'SUBSCRIPTION'
  ) {
    return source;
  }
  const id = o.id ? ` ${o.id}` : '';
  throw new Error(
    `Customer 360 financial engine: missing or invalid paymentSource for order${id}`,
  );
}

function isPaidCashStatus(status: CashStatus | string | null | undefined): boolean {
  return (
    status === 'PAID' ||
    status === CashStatus.PAID_TO_DRIVER ||
    status === CashStatus.PAID_ONLINE ||
    status === CashStatus.HANDED_OVER_TO_OFFICE
  );
}

function isPaidOrder(o: CustomerFinancialInput['orders'][number]): boolean {
  if (o.status === OrderStatus.CANCELED) return false;
  const source = assertPaymentSource(o);
  if (!isPaidCashStatus(o.cashStatus)) return false;
  if (source === 'WALLET') return false;
  if (o.posPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT) return false;
  return true;
}

function isSubscriptionPaidOrder(
  o: CustomerFinancialInput['orders'][number],
  subscriptionId: string | null,
): boolean {
  if (o.status === OrderStatus.CANCELED) return false;
  if (assertPaymentSource(o) !== 'SUBSCRIPTION') return false;
  if (!subscriptionId) return true;
  return o.subscriptionId === subscriptionId;
}

function orderAmount(o: CustomerFinancialInput['orders'][number]): number {
  return money(o.amount ?? o.totalPrice);
}

export function computeCustomerFinancials(
  data: CustomerFinancialInput,
): CustomerFinancialEngineResult {
  const activeOrders = data.orders.filter((o) => o.status !== OrderStatus.CANCELED);
  activeOrders.forEach(assertPaymentSource);
  const paidOrderIds = new Set(
    activeOrders
      .filter((o) => o.id && isPaidOrder(o))
      .map((o) => o.id as string),
  );

  const totalInvoicesKd = round(
    activeOrders.reduce((sum, o) => sum + orderAmount(o), 0),
  );

  const orderPaymentsKd = round(
    activeOrders
      .filter(isPaidOrder)
      .reduce((sum, o) => sum + orderAmount(o), 0),
  );

  const ledgerPaymentsKd = round(
    data.debtLedger
      .filter((l) => l.source === DebtSource.PAYMENT || l.source === 'PAYMENT')
      .filter((l) => !l.orderId || !paidOrderIds.has(l.orderId))
      .reduce((sum, l) => sum + Math.abs(money(l.amount)), 0),
  );

  const totalPaymentsKd = round(orderPaymentsKd + ledgerPaymentsKd);
  const overpaymentBalanceKd =
    totalPaymentsKd > totalInvoicesKd + OVERPAYMENT_TOLERANCE_KD ?
      round(totalPaymentsKd - totalInvoicesKd)
    : 0;
  const totalDueKd = Math.max(round(totalInvoicesKd - totalPaymentsKd), 0);
  const subscriptionId = data.subscription?.id ?? null;
  const subscriptionValueKd =
    data.subscription ?
      round(money(data.subscription.value ?? data.subscription.planActualBalanceSnapshot))
    : 0;
  const subscriptionConsumedKd =
    data.subscription ?
      round(
        activeOrders
          .filter((o) => isSubscriptionPaidOrder(o, subscriptionId))
          .reduce((sum, o) => sum + orderAmount(o), 0),
      )
    : 0;
  const subscriptionRemainingKd =
    data.subscription ?
      Math.max(round(subscriptionValueKd - subscriptionConsumedKd), 0)
    : 0;
  const anomalyFlags = detectCustomerFinancialAnomalies(data, paidOrderIds, {
    totalInvoicesKd,
    totalPaymentsKd,
    overpaymentBalanceKd,
  });

  return {
    totalInvoicesKd: fourDp(totalInvoicesKd),
    totalPaymentsKd: fourDp(totalPaymentsKd),
    totalDueKd: fourDp(totalDueKd),
    consumedKd: fourDp(totalInvoicesKd),
    subscriptionRemainingKd: fourDp(subscriptionRemainingKd),
    subscription: {
      value: fourDp(subscriptionValueKd),
      consumed: fourDp(subscriptionConsumedKd),
      remaining: fourDp(subscriptionRemainingKd),
    },
    overpaymentBalanceKd: fourDp(overpaymentBalanceKd),
    anomalyFlags,
  };
}

function detectCustomerFinancialAnomalies(
  data: CustomerFinancialInput,
  paidOrderIds: Set<string>,
  totals: {
    totalInvoicesKd: number;
    totalPaymentsKd: number;
    overpaymentBalanceKd: number;
  },
): CustomerFinancialAnomaly[] {
  const flags: CustomerFinancialAnomaly[] = [];
  for (const ledger of data.debtLedger) {
    if (
      (ledger.source === DebtSource.PAYMENT || ledger.source === 'PAYMENT') &&
      ledger.orderId &&
      paidOrderIds.has(ledger.orderId)
    ) {
      flags.push({
        type: 'DOUBLE_COUNT_DETECTED',
        orderId: ledger.orderId,
        amountKd: fourDp(Math.abs(money(ledger.amount))),
        source: 'DEBT_LEDGER_PAYMENT_LINKED_TO_PAID_ORDER',
      });
    }
  }
  const subscriptionId = data.subscription?.id ?? null;
  if (subscriptionId) {
    for (const order of data.orders) {
      if (
        order.status !== OrderStatus.CANCELED &&
        order.subscriptionId === subscriptionId &&
        assertPaymentSource(order) !== 'SUBSCRIPTION'
      ) {
        flags.push({
          type: 'SUBSCRIPTION_SOURCE_ANOMALY',
          orderId: order.id ?? null,
          amountKd: fourDp(orderAmount(order)),
          source: String(order.paymentSource ?? order.posPaymentMethod ?? 'UNKNOWN'),
        });
      }
    }
  }
  if (totals.overpaymentBalanceKd > OVERPAYMENT_TOLERANCE_KD) {
    flags.push({
      type: 'OVERPAYMENT_DETECTED',
      amountKd: fourDp(totals.overpaymentBalanceKd),
      source: `payments=${fourDp(totals.totalPaymentsKd)} invoices=${fourDp(totals.totalInvoicesKd)}`,
    });
  }
  return flags;
}

/**
 * DB adapter around the pure financial engine. Do not calculate totals here.
 */
export async function computeCustomer360FinancialCore(
  prisma: PrismaService,
  customerId: string,
): Promise<Customer360FinancialsDto> {
  const [orders, ledger, activeSub, customer] = await Promise.all([
    prisma.order.findMany({
      where: { customerId, status: { not: OrderStatus.CANCELED } },
      select: {
        id: true,
        status: true,
        totalPrice: true,
        cashStatus: true,
        posPaymentMethod: true,
        subscriptionId: true,
      },
    }),
    prisma.debtLedgerEntry.findMany({
      where: { customerId },
      select: { orderId: true, source: true, amount: true },
    }),
    prisma.customerSubscription.findFirst({
      where: { customerId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, planActualBalanceSnapshot: true },
    }),
    prisma.customer.findUnique({
      where: { id: customerId },
      select: { isBlocked: true, blockReason: true, blockedAt: true },
    }),
  ]);

  const fin = computeCustomerFinancials({
    orders: orders.map((order) => ({
      ...order,
      paymentSource: paymentSourceForOrder(order.posPaymentMethod),
    })),
    debtLedger: ledger,
    subscription: activeSub,
  });
  await logFinancialAnomalies(prisma, customerId, fin.anomalyFlags);

  return {
    consumedKd: fin.consumedKd,
    totalInvoicesKd: fin.totalInvoicesKd,
    subscriptionValueKd: fin.subscription.value,
    subscriptionConsumedKd: fin.subscription.consumed,
    subscriptionRemainingKd: fin.subscription.remaining,
    totalPaymentsKd: fin.totalPaymentsKd,
    totalDueKd: fin.totalDueKd,
    overpaymentBalanceKd: fin.overpaymentBalanceKd,
    isBlocked: customer?.isBlocked ?? false,
    blockReason: customer?.blockReason ?? null,
    blockedAtIso: customer?.blockedAt?.toISOString() ?? null,
  };
}

async function logFinancialAnomalies(
  prisma: PrismaService,
  customerId: string,
  flags: CustomerFinancialAnomaly[],
): Promise<void> {
  if (flags.length === 0) return;
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  for (const flag of flags) {
    const source = flag.orderId ?? flag.source ?? 'customer';
    const existing = await prisma.auditLog.findFirst({
      where: {
        customerId,
        action: flag.type,
        source,
        timestamp: { gte: since },
      },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.auditLog.create({
      data: {
        customerId,
        orderId: flag.orderId ?? null,
        action: flag.type,
        resource: 'financial_integrity',
        amount: flag.amountKd ?? null,
        source,
        status: AuditStatus.SUCCESS,
        changes: flag,
      },
    });
  }
}

function paymentSourceForOrder(
  method: PosPaymentMethod | string | null | undefined,
): Customer360PaymentSource {
  if (method === PosPaymentMethod.CASH || method === 'CASH') return 'CASH';
  if (method === PosPaymentMethod.KNET || method === 'KNET') return 'KNET';
  if (
    method === PosPaymentMethod.ONLINE ||
    method === PosPaymentMethod.PAYMENT_LINK ||
    method === 'ONLINE' ||
    method === 'PAYMENT_LINK'
  ) {
    return 'ONLINE';
  }
  if (
    method === PosPaymentMethod.SUBSCRIPTION_WALLET ||
    method === 'SUBSCRIPTION_WALLET'
  ) {
    return 'SUBSCRIPTION';
  }
  if (method === PosPaymentMethod.DEBT_ON_ACCOUNT || method === 'DEBT_ON_ACCOUNT') {
    return 'WALLET';
  }
  throw new Error(
    `Customer 360 financial engine: missing or invalid order payment method (${method ?? 'null'})`,
  );
}
