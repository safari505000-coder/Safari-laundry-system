import {
  AuditStatus,
  CashStatus,
  OrderStatus,
  Prisma,
  PosPaymentMethod,
} from '@prisma/client';
import { DebtSource } from '../finance/enums/debt-source.enum';
import { round4Kd } from '../finance/utils/round4kd.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  computeCanonicalCustomerDebt,
  type JournalReader,
} from '../finance/canonical-customer-debt.util';
import { computeSubscriptionConsumption } from './subscription-consumption.projection';
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
    /**
     * V20.8.1 — subscription window start. When provided, only
     * wallet-absorption ledger rows created on/after this instant
     * count toward the active-subscription consumption. Older
     * activations remain frozen in the historical record.
     */
    activatedAt?: Date | null;
  } | null;
  /**
   * V20.8.1 — wallet-absorption history (`PAYMENT:WALLET:` rows).
   * Optional — pre-V20.8.1 callers that omit this field get the
   * legacy (direct-orders-only) consumption number, which is the
   * exact pre-change behaviour. Production callers SHOULD pass the
   * ledger so absorbed invoices reflect into subscription
   * consumption.
   */
  walletAbsorptionLedger?: ReadonlyArray<{
    id?: string;
    source: DebtSource | string;
    sourceRef?: string | null;
    amount: MoneyLike;
    createdAt: Date;
  }>;
  activationDebtSettlements?: ReadonlyArray<{
    id?: string;
    subscriptionId?: string | null;
    amount: MoneyLike;
    createdAt: Date;
  }>;
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
  // V23.3+ — use Prisma.Decimal with ROUND_HALF_EVEN instead of JS float
  // arithmetic (Math.round + EPSILON) to avoid micro-fil drift.
  const totalDueDec = new Prisma.Decimal(totalInvoicesKd.toString()).sub(
    new Prisma.Decimal(totalPaymentsKd.toString()),
  );
  const subscriptionId = data.subscription?.id ?? null;
  const subscriptionValueKd =
    data.subscription ?
      round(money(data.subscription.value ?? data.subscription.planActualBalanceSnapshot))
    : 0;

  // V20.8.1 — canonical subscription consumption.
  //
  // Includes BOTH:
  //   (1) directly subscription-paid orders (pre-V20.8.1 path)
  //   (2) wallet-absorption ledger rows since `activatedAt`
  //
  // The pre-V20.8.1 callers that didn't pass `walletAbsorptionLedger`
  // get the same `consumedKd` they had before — so this is byte-
  // identical for legacy paths and additive for the canonical path.
  const directSubscriptionOrders = activeOrders
    .filter((o) => isSubscriptionPaidOrder(o, subscriptionId))
    .map((o) => ({
      id: o.id,
      subscriptionId: o.subscriptionId ?? null,
      amount: orderAmount(o),
    }));
  const walletAbsorptionInput = (data.walletAbsorptionLedger ?? []).map(
    (l) => ({
      id: l.id,
      source: l.source,
      sourceRef: l.sourceRef ?? null,
      amount: money(l.amount),
      createdAt: l.createdAt,
    }),
  );
  const activationDebtSettlementInput = (
    data.activationDebtSettlements ?? []
  ).map((s) => ({
    id: s.id,
    subscriptionId: s.subscriptionId ?? null,
    amount: money(s.amount),
    createdAt: s.createdAt,
  }));
  const subscriptionProjection = computeSubscriptionConsumption({
    subscriptionId,
    planActualBalanceKd: subscriptionValueKd,
    activatedAt: data.subscription?.activatedAt ?? null,
    directOrders: directSubscriptionOrders,
    walletAbsorptionLedger: walletAbsorptionInput,
    activationDebtSettlements: activationDebtSettlementInput,
  });
  const subscriptionConsumedKd = subscriptionProjection.consumedKd;
  const subscriptionRemainingKd = subscriptionProjection.remainingKd;
  const anomalyFlags = detectCustomerFinancialAnomalies(data, paidOrderIds, {
    totalInvoicesKd,
    totalPaymentsKd,
    overpaymentBalanceKd,
  });

  return {
    totalInvoicesKd: fourDp(totalInvoicesKd),
    totalPaymentsKd: fourDp(totalPaymentsKd),
    totalDueKd: round4Kd(totalDueDec.lessThan(0) ? new Prisma.Decimal(0) : totalDueDec),
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
  /**
   * V20.4 — Phase 2 optional journal reader. When provided, the
   * Customer 360 response carries the bank-grade canonical debt
   * value alongside the legacy `totalDueKd`; otherwise the
   * canonical falls back to the partial-payment Σ remaining
   * source (still safer than the legacy sum). The dependency is
   * optional so the function stays usable in tests / call sites
   * that haven't been wired through Nest DI yet.
   */
  journal?: JournalReader | null,
): Promise<Customer360FinancialsDto> {
  const [orders, ledger, activeSub, customer, wallet, activationRows] =
    await Promise.all([
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
    Promise.resolve([] as Array<{ orderId: string | null; source: string; amount: MoneyLike; sourceRef: string | null; createdAt: Date }>),
    prisma.customerSubscription.findFirst({
      where: { customerId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      // V20.8.1 — also fetch `activatedAt` so the projection can
      // exclude historical absorptions tied to prior subscriptions.
      select: {
        id: true,
        planActualBalanceSnapshot: true,
        activatedAt: true,
      },
    }),
    prisma.customer.findUnique({
      where: { id: customerId },
      select: { isBlocked: true, blockReason: true, blockedAt: true },
    }),
    // V20.8.1 — wallet balance for the explicit `walletPrepaidCreditKd`
    // field. Read-only — we never mutate the wallet here.
      prisma.customerWallet.findUnique({
        where: { customerId },
        select: { balance: true },
      }),
      prisma.transactionHistory.findMany({
        where: {
          customerId,
          type: 'SUBSCRIPTION_ACTIVATION',
        },
        select: {
          id: true,
          subscriptionId: true,
          metadata: true,
          createdAt: true,
        },
      }),
    ]);

  const fin = computeCustomerFinancials({
    orders: orders.map((order) => ({
      ...order,
      paymentSource: paymentSourceForOrder(order.posPaymentMethod),
    })),
    debtLedger: ledger,
    subscription: activeSub,
    walletAbsorptionLedger: ledger
      .filter(
        (l): l is typeof l & { sourceRef: string; createdAt: Date } =>
          typeof l.sourceRef === 'string' &&
          l.sourceRef.startsWith('PAYMENT:WALLET:') &&
          l.createdAt instanceof Date,
      )
      .map((l) => ({
        source: l.source,
        sourceRef: l.sourceRef,
        amount: l.amount,
        createdAt: l.createdAt,
      })),
    activationDebtSettlements: activationRows.flatMap((row) => {
      const metadata = row.metadata as Record<string, unknown> | null;
      const amount = metadata?.debtSettled;
      if (amount === undefined || amount === null) return [];
      return [{
        id: row.id,
        subscriptionId: row.subscriptionId,
        amount: String(amount),
        createdAt: row.createdAt,
      }];
    }),
  });
  await logFinancialAnomalies(prisma, customerId, fin.anomalyFlags);

  // V20.4 — Phase 2 single canonical debt read. Always computed
  // so the response shape is stable; under V20.3+journal flag
  // this is the bank-grade number, otherwise it equals the
  // partial-payment Σ remaining_balance.
  const canonical = await computeCanonicalCustomerDebt(
    prisma,
    journal ?? null,
    customerId,
  );

  // V20.8.1 — explicit financial breakdown for UI clarity.
  const walletBalanceKd = wallet ? money(wallet.balance) : 0;
  const subscriptionRemainingNum = money(fin.subscription.remaining);
  // Wallet may carry both subscription-credit AND non-subscription
  // prepaid credit; the prepaid bucket is whatever is left over.
  const walletPrepaidCreditKd = Math.max(
    round(walletBalanceKd - subscriptionRemainingNum),
    0,
  );
  const breakdown = {
    receivableDebtKd: canonical.canonicalDebtKd.toFixed(4),
    subscriptionRemainingKd: fin.subscription.remaining,
    walletPrepaidCreditKd: fourDp(walletPrepaidCreditKd),
    paidTotalKd: fin.totalPaymentsKd,
    operatorHint: buildOperatorHint({
      receivableDebtKd: canonical.canonicalDebtKd.toString(),
      subscriptionRemainingKd: subscriptionRemainingNum,
      walletPrepaidCreditKd,
    }),
  };

  // V23.2 — `totalDueKd` (legacy "invoices − payments" gross) was
  // removed from the public DTO. The engine still computes it
  // internally for its own arithmetic invariants but it never
  // crosses the wire; consumers read `canonicalDebtKd` instead.
  return {
    consumedKd: fin.consumedKd,
    totalInvoicesKd: fin.totalInvoicesKd,
    subscriptionValueKd: fin.subscription.value,
    subscriptionConsumedKd: fin.subscription.consumed,
    subscriptionRemainingKd: fin.subscription.remaining,
    totalPaymentsKd: fin.totalPaymentsKd,
    canonicalDebtKd: canonical.canonicalDebtKd.toFixed(4),
    canonicalDebtSource: canonical.source,
    overpaymentBalanceKd: fin.overpaymentBalanceKd,
    isBlocked: customer?.isBlocked ?? false,
    blockReason: customer?.blockReason ?? null,
    blockedAtIso: customer?.blockedAt?.toISOString() ?? null,
    breakdown,
  };
}

/**
 * V20.8.1 — Plain-language operator hint summarising the breakdown.
 *
 * The hint is server-rendered (not a client transformation) so all
 * UI surfaces — call-center 360, subscriber portal, statement —
 * speak the same words for the same financial state.
 */
function buildOperatorHint(input: {
  receivableDebtKd: number | string;
  subscriptionRemainingKd: number;
  walletPrepaidCreditKd: number;
}): string {
  const debt = typeof input.receivableDebtKd === 'string'
    ? Number.parseFloat(input.receivableDebtKd)
    : input.receivableDebtKd;
  const segments: string[] = [];
  if (debt > 0) {
    segments.push(`العميل مدين بمبلغ ${debt.toFixed(4)} د.ك`);
  } else {
    segments.push('لا توجد مديونية على العميل');
  }
  if (input.subscriptionRemainingKd > 0) {
    segments.push(
      `رصيد الباقة المتبقي ${input.subscriptionRemainingKd.toFixed(4)} د.ك`,
    );
  }
  if (input.walletPrepaidCreditKd > 0) {
    segments.push(
      `رصيد مدفوع مسبقاً ${input.walletPrepaidCreditKd.toFixed(4)} د.ك`,
    );
  }
  return segments.join(' · ');
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
