import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CashStatus, LedgerTransactionType, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerLedgerService } from '../customer-ledger/customer-ledger.service';
import { PaymentsService } from '../common/services/payments.service';
import { ActivateSubscriptionDto } from './dto/activate-subscription.dto';
import { ExtendSubscriptionDto } from './dto/extend-subscription.dto';
import type { SettlementHistoryRowDto } from './dto/settlement-history-row.dto';
import type { CallCenterOperationsSummaryDto } from './dto/operations-summary.dto';
import type {
  DebtRecoveryDayRowDto,
  DebtRecoveryReportDto,
} from './dto/debt-recovery-report.dto';
import type { ReminderResultDto } from './dto/reminder-result.dto';

/**
 * V1.6.8 — Cooldown windows are per-feature now.
 *
 * - `ORDER_REMINDER_COOLDOWN_MS` (2.5 h / 9_000_000 ms) governs the
 *   Collections-page "Send payment link" button, per Owner directive:
 *   recall window tightened from 24 h → 2.5 h so agents can re-engage
 *   same-day debts without bumping an arbitrary guard.
 * - `SUBSCRIBER_REMINDER_COOLDOWN_MS` (24 h) is retained for
 *   subscription-renewal nudges, which are a fundamentally different
 *   flow (low-frequency, customer-friendly) and must NOT be shortened.
 */
const ORDER_REMINDER_COOLDOWN_MS = 2.5 * 60 * 60 * 1000; // 9_000_000 ms
const SUBSCRIBER_REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function buildReminderResult(args: {
  sent: boolean;
  reminderCount: number;
  lastReminderAt: Date | null;
  now: Date;
  cooldownMs: number;
}): ReminderResultDto {
  const { sent, reminderCount, lastReminderAt, now, cooldownMs } = args;
  const nextAllowedAt =
    !sent && lastReminderAt
      ? new Date(lastReminderAt.getTime() + cooldownMs)
      : null;
  // V1.6.8 — both resolutions are reported; minute precision is what
  // the Collections toast needs for a 2.5 h window, while hours stays
  // backward-compatible for the Subscribers screen and the legacy
  // toast strings that still read `{{hours}}`.
  const remainingMs = nextAllowedAt
    ? Math.max(0, nextAllowedAt.getTime() - now.getTime())
    : null;
  const minutesUntilNext =
    remainingMs !== null ? Math.ceil(remainingMs / (60 * 1000)) : null;
  const hoursUntilNext =
    remainingMs !== null ? Math.ceil(remainingMs / (60 * 60 * 1000)) : null;
  return {
    sent,
    reminderCount,
    lastReminderAtIso: lastReminderAt?.toISOString() ?? null,
    nextAllowedAtIso: nextAllowedAt?.toISOString() ?? null,
    hoursUntilNext,
    minutesUntilNext,
  };
}

const FOUR_DP = (d: Prisma.Decimal): string => d.toFixed(4);
/**
 * V1.6.5 — KWD standard is 3 decimal places (fils). The Collections KPI
 * cards and the table both display 3dp, so the aggregates that feed
 * them must serialize with the same precision. Historic reports that
 * still expect 4dp (e.g. the Debt-Recovery report) keep using FOUR_DP.
 */
const KWD_DP = (d: Prisma.Decimal): string => d.toFixed(3);
const toIsoDay = (d: Date): string => d.toISOString().slice(0, 10);

/** Parse YYYY-MM-DD into UTC midnight. Invalid strings throw. */
function parseDayUtc(iso: string): Date {
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`Invalid date: ${iso}`);
  }
  return d;
}

/**
 * V1.6.1 — Kuwait (Asia/Kuwait) is UTC+3 with no daylight-saving. The
 * "Collected Today" KPI must reset at Kuwait local midnight, NOT UTC
 * midnight, otherwise the card appears to reset at 03:00 local time.
 * We compute the Kuwait day from a fixed offset so it's independent of
 * wherever the Node process is running.
 */
const KUWAIT_OFFSET_MS = 3 * 60 * 60 * 1000;

function kuwaitDayBounds(now: Date): {
  dayStart: Date;
  dayEnd: Date;
  dayIsoLocal: string;
} {
  // Shift "now" by +3h so reading UTC components yields Kuwait-local Y/M/D.
  const shifted = new Date(now.getTime() + KUWAIT_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const d = shifted.getUTCDate();
  // Kuwait 00:00 local → the same calendar day at UTC 00:00 minus 3h.
  const dayStart = new Date(Date.UTC(y, m, d) - KUWAIT_OFFSET_MS);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const dayIsoLocal = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { dayStart, dayEnd, dayIsoLocal };
}

/**
 * V1.6.1 — Orders don't carry `branchId` directly; the fulfilling branch
 * is the driver's branch for driver-led sales, falling back to the
 * customer's `originBranchId` for office-only invoices (e.g. a debt
 * paid online without a driver).
 */
function orderBranchWhere(
  branchId: string | null,
): Prisma.OrderWhereInput | undefined {
  if (!branchId) return undefined;
  return {
    OR: [
      { driver: { is: { branchId } } },
      {
        driverId: null,
        customer: { is: { originBranchId: branchId } },
      },
    ],
  };
}

/**
 * V1.6.2 — "Collected Today" branch scope, per Owner directive:
 *   "The Green Card should show collections based on the BRANCH of the
 *    person who handled the transaction OR the branch the money belongs
 *    to."
 *
 * That maps to a 4-way OR over every natural attribution path on a
 * `TransactionHistory` row:
 *   1. `performedBy.branchId`       — the agent/driver who booked the
 *                                     collection (most authoritative
 *                                     "branch that handled the money").
 *   2. `order.driver.branchId`      — the branch whose driver served
 *                                     this invoice.
 *   3. `order.customer.originBranchId` — the branch that attributed the
 *                                     customer (covers driver-less
 *                                     office collections).
 *   4. `customer.originBranchId`    — for SUBSCRIPTION_ACTIVATION and
 *                                     other orderless rows.
 *
 * This fixes the "Red went down but Green stayed 0 under a branch
 * filter" symptom: the settlement row often lives on a different axis
 * than the unpaid-order row it cleared (e.g. a debt on a Branch-B
 * customer cleared by a Branch-A owner).
 */
function ledgerBranchWhere(
  branchId: string | null,
): Prisma.TransactionHistoryWhereInput | undefined {
  if (!branchId) return undefined;
  return {
    OR: [
      { performedBy: { is: { branchId } } },
      { order: { is: { driver: { is: { branchId } } } } },
      { order: { is: { customer: { is: { originBranchId: branchId } } } } },
      { customer: { is: { originBranchId: branchId } } },
    ],
  };
}

/** Extract `debtSettled` from a ledger row metadata blob safely. */
function extractDebtSettled(meta: Prisma.JsonValue | null): Prisma.Decimal {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return new Prisma.Decimal(0);
  }
  const v = (meta as Record<string, unknown>).debtSettled;
  if (typeof v !== 'string') return new Prisma.Decimal(0);
  try {
    return new Prisma.Decimal(v);
  } catch {
    return new Prisma.Decimal(0);
  }
}

/** V1.6.4 — type-safe read of the `debtSettlementViaLink` flag. */
function isDebtViaLinkRow(meta: Prisma.JsonValue | null): boolean {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return false;
  return (meta as Record<string, unknown>).debtSettlementViaLink === true;
}

@Injectable()
export class CallCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerLedger: CustomerLedgerService,
    private readonly payments: PaymentsService,
  ) {}

  /**
   * V1.6.0 — on-demand payment link for ANY unpaid order (Cash, KNET,
   * DEBT_ON_ACCOUNT, …). Called by the "Payment link" button on the
   * Collections page so the agent does not need to pre-create links at
   * POS time. When the callback from the gateway lands,
   * `finalizeSinglePaidOrderFromGateway` will auto-switch the method to
   * ONLINE and tag the row as a debt settlement via link.
   */
  async ensureOrderPaymentLink(orderId: string): Promise<{ url: string }> {
    const link = await this.payments.ensurePaymentLinkForUnpaidOrder(orderId);
    return { url: link.url };
  }

  listActiveSubscriptionPlans() {
    return this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        salePrice: true,
        actualBalance: true,
      },
    });
  }

  async searchCustomers(query: string) {
    const q = query.trim();
    if (q.length < 2) {
      throw new BadRequestException(
        'Search query must be at least 2 characters',
      );
    }
    return this.prisma.customer.findMany({
      where: {
        OR: [
          { phone: { contains: q, mode: 'insensitive' } },
          { phone2: { contains: q, mode: 'insensitive' } },
          { address: { contains: q, mode: 'insensitive' } },
          { displayName: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 50,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        phone: true,
        phone2: true,
        displayName: true,
        address: true,
        createdAt: true,
        wallet: {
          select: {
            balance: true,
            debt: true,
          },
        },
      },
    });
  }

  async activateSubscription(userId: string, dto: ActivateSubscriptionDto) {
    return this.prisma.$transaction(async (tx) => {
      const settlement = await this.customerLedger.activateSubscriptionPlan(tx, {
        customerId: dto.customerId,
        planId: dto.planId,
        performedByUserId: userId,
      });
      const [customer, plan, wallet] = await Promise.all([
        tx.customer.findUniqueOrThrow({
          where: { id: dto.customerId },
          select: {
            id: true,
            phone: true,
            phone2: true,
            address: true,
            displayName: true,
          },
        }),
        tx.subscriptionPlan.findUniqueOrThrow({
          where: { id: dto.planId },
        }),
        tx.customerWallet.findUniqueOrThrow({
          where: { customerId: dto.customerId },
        }),
      ]);
      return {
        customer,
        plan: {
          id: plan.id,
          name: plan.name,
          price: plan.salePrice.toString(),
          creditAmount: plan.actualBalance.toString(),
        },
        wallet: {
          balance: wallet.balance.toString(),
          debt: wallet.debt.toString(),
        },
        settlement,
      };
    });
  }

  /**
   * Dastur V1.5.3 — Management Room "Extend Subscription" (تمديد).
   *
   * Adds N calendar days to the customer's existing `subscriptionExpiresAt`
   * WITHOUT touching the wallet balance, debt, or any ledger amount. If the
   * subscription has already lapsed, extension is relative to "now" so the
   * customer gets a fresh N-day window instead of a window in the past.
   *
   * Guardrails:
   *  - Wallet must exist and already have an active plan on record
   *    (Extend makes no sense without something to extend — Upgrade is the
   *    right flow for "no plan yet").
   *  - Requires an existing `subscriptionExpiresAt`. Otherwise returns a
   *    clear 400 so the frontend can route the operator to Upgrade.
   *
   * We record the extension as a TransactionHistory row (type
   * SUBSCRIPTION_ACTIVATION, amount=0, metadata.extensionOnly=true) so the
   * owner has an audit trail of every manual extension.
   */
  async extendSubscription(userId: string, dto: ExtendSubscriptionDto) {
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.customerWallet.findUnique({
        where: { customerId: dto.customerId },
        select: {
          id: true,
          balance: true,
          debt: true,
          subscriptionPlanId: true,
          subscriptionPlanName: true,
          subscriptionActivatedAt: true,
          subscriptionExpiresAt: true,
        },
      });
      if (!wallet) {
        throw new NotFoundException(
          'Customer has no wallet — activate a subscription before extending.',
        );
      }
      if (!wallet.subscriptionPlanId || !wallet.subscriptionExpiresAt) {
        throw new BadRequestException(
          'No active subscription found — use Upgrade to start a new plan.',
        );
      }

      const now = new Date();
      const anchor =
        wallet.subscriptionExpiresAt.getTime() > now.getTime()
          ? wallet.subscriptionExpiresAt
          : now;
      const newExpiry = new Date(anchor.getTime());
      newExpiry.setUTCDate(newExpiry.getUTCDate() + dto.extensionDays);

      await tx.customerWallet.update({
        where: { id: wallet.id },
        data: { subscriptionExpiresAt: newExpiry },
      });

      await tx.transactionHistory.create({
        data: {
          type: LedgerTransactionType.SUBSCRIPTION_ACTIVATION,
          customerId: dto.customerId,
          amount: new Prisma.Decimal(0),
          balanceBefore: wallet.balance,
          balanceAfter: wallet.balance,
          debtBefore: wallet.debt,
          debtAfter: wallet.debt,
          performedById: userId,
          metadata: {
            extensionOnly: true,
            extensionDays: dto.extensionDays,
            planId: wallet.subscriptionPlanId,
            planName: wallet.subscriptionPlanName ?? null,
            previousExpiresAt: wallet.subscriptionExpiresAt.toISOString(),
            newExpiresAt: newExpiry.toISOString(),
          },
        },
      });

      return {
        customerId: dto.customerId,
        extensionDays: dto.extensionDays,
        previousExpiresAt: wallet.subscriptionExpiresAt.toISOString(),
        newExpiresAt: newExpiry.toISOString(),
        planId: wallet.subscriptionPlanId,
        planName: wallet.subscriptionPlanName ?? null,
      };
    });
  }

  async listCustomerSettlementHistory(
    customerId: string,
    take = 40,
  ): Promise<SettlementHistoryRowDto[]> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const rows = await this.prisma.transactionHistory.findMany({
      where: {
        customerId,
        type: {
          in: [
            LedgerTransactionType.SUBSCRIPTION_ACTIVATION,
            LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        createdAt: true,
        type: true,
        balanceAfter: true,
        debtAfter: true,
        orderId: true,
        metadata: true,
      },
    });

    return rows.map((r) => {
      const meta =
        r.metadata && typeof r.metadata === 'object' && !Array.isArray(r.metadata)
          ? (r.metadata as Record<string, unknown>)
          : {};
      const str = (k: string): string | undefined => {
        const v = meta[k];
        return typeof v === 'string' ? v : undefined;
      };
      return {
        id: r.id,
        createdAt: r.createdAt,
        type: r.type,
        totalCollected: str('totalCollected'),
        debtSettled: str('debtSettled'),
        creditedToBalance: str('creditedToBalance'),
        balanceAfter: r.balanceAfter.toString(),
        debtAfter: r.debtAfter.toString(),
        planName: str('planName'),
        orderId: r.orderId ?? undefined,
      };
    });
  }

  /**
   * Dastur §5 (V1.5) — order/collection reminder with a 24h guard.
   *
   * The `updateMany({ where: { id, lastReminderAt-older-than-24h-or-null } })`
   * is atomic at the DB layer: if another request already bumped the row in
   * the last 24h, our WHERE clause matches zero rows and `count = 0`, so we
   * re-read the current state and return a cooldown-only payload.
   */
  async sendOrderReminder(orderId: string): Promise<ReminderResultDto> {
    const now = new Date();
    // V1.6.8 — Collections recall window is 2.5 h (9_000_000 ms).
    const cutoff = new Date(now.getTime() - ORDER_REMINDER_COOLDOWN_MS);

    const update = await this.prisma.order.updateMany({
      where: {
        id: orderId,
        OR: [
          { lastReminderAt: null },
          { lastReminderAt: { lt: cutoff } },
        ],
      },
      data: {
        reminderCount: { increment: 1 },
        lastReminderAt: now,
      },
    });

    const fresh = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { reminderCount: true, lastReminderAt: true },
    });
    if (!fresh) throw new NotFoundException('Order not found');

    return buildReminderResult({
      sent: update.count > 0,
      reminderCount: fresh.reminderCount,
      lastReminderAt: fresh.lastReminderAt,
      now,
      cooldownMs: ORDER_REMINDER_COOLDOWN_MS,
    });
  }

  /**
   * Dastur §5 (V1.5) — subscriber reminder (subscription renewal nudge).
   * Counter lives on CustomerWallet. Same 24h atomic guard.
   */
  async sendSubscriberReminder(customerId: string): Promise<ReminderResultDto> {
    const now = new Date();
    // V1.6.8 — subscriber renewal nudges stay on the conservative 24 h
    // window; only the Collections recall was tightened.
    const cutoff = new Date(now.getTime() - SUBSCRIBER_REMINDER_COOLDOWN_MS);

    const update = await this.prisma.customerWallet.updateMany({
      where: {
        customerId,
        OR: [
          { subscriptionLastReminderAt: null },
          { subscriptionLastReminderAt: { lt: cutoff } },
        ],
      },
      data: {
        subscriptionReminderCount: { increment: 1 },
        subscriptionLastReminderAt: now,
      },
    });

    const fresh = await this.prisma.customerWallet.findUnique({
      where: { customerId },
      select: {
        subscriptionReminderCount: true,
        subscriptionLastReminderAt: true,
      },
    });
    if (!fresh) {
      // Either the customer has no wallet yet or doesn't exist at all.
      const customer = await this.prisma.customer.findUnique({
        where: { id: customerId },
        select: { id: true },
      });
      if (!customer) throw new NotFoundException('Customer not found');
      // No wallet — treat as a 0-count first-reminder: create wallet lazily.
      const createdWallet = await this.prisma.customerWallet.create({
        data: {
          customerId,
          subscriptionReminderCount: 1,
          subscriptionLastReminderAt: now,
        },
        select: {
          subscriptionReminderCount: true,
          subscriptionLastReminderAt: true,
        },
      });
      return buildReminderResult({
        sent: true,
        reminderCount: createdWallet.subscriptionReminderCount,
        lastReminderAt: createdWallet.subscriptionLastReminderAt,
        now,
        cooldownMs: SUBSCRIBER_REMINDER_COOLDOWN_MS,
      });
    }

    return buildReminderResult({
      sent: update.count > 0,
      reminderCount: fresh.subscriptionReminderCount,
      lastReminderAt: fresh.subscriptionLastReminderAt,
      now,
      cooldownMs: SUBSCRIBER_REMINDER_COOLDOWN_MS,
    });
  }

  /**
   * Dastur §5 — three-KPI summary for the Call Center Ops Dashboard.
   * All aggregates are "live right now" — no caching, since collection teams
   * need the latest numbers to drive outbound calls.
   */
  async getOperationsSummary(
    branchId: string | null = null,
  ): Promise<CallCenterOperationsSummaryDto> {
    // V1.6.1 — strictly sum [Kuwait 00:00 today → now]. At 00:00 Kuwait
    // local time the KPI naturally resets because `createdAt` is compared
    // against fresh midnight bounds on every request.
    const now = new Date();
    const { dayStart, dayEnd, dayIsoLocal } = kuwaitDayBounds(now);

    const orderBranch = orderBranchWhere(branchId);
    const ledgerBranch = ledgerBranchWhere(branchId);

    // All three aggregates run in parallel. The "market debt" aggregate is
    // the SUM of every uncollected invoice (cashStatus UNPAID, status !=
    // CANCELED) regardless of payment method — byte-identical to the
    // filter used by `OrdersService.listUnpaidCollectionOrders`, so the
    // KPI card equals the table-column sum by construction.
    //
    // `branchId` (when provided) scopes every aggregate the same way:
    // driver.branchId, or customer.originBranchId for driver-less rows.
    const [unpaidAgg, todaysLedgerRows, pendingLinksCount] = await Promise.all([
      this.prisma.order.aggregate({
        _sum: { totalPrice: true },
        where: {
          cashStatus: CashStatus.UNPAID,
          status: { not: OrderStatus.CANCELED },
          ...(orderBranch ?? {}),
        },
      }),
      // V1.6.4 — STRICT: Green card reflects ONLY Collections-page
      // recoveries. We fetch today's ORDER_WALLET_SETTLEMENT rows for
      // the branch scope, then filter in memory on
      // `metadata.debtSettlementViaLink === true`. In-memory filtering
      // avoids Prisma-version-specific quirks with JSONB boolean
      // filters where `{ path: [...], equals: true }` can silently
      // return zero rows on some PostgreSQL + Prisma combinations,
      // which was the root cause of the "Red drops but Green stays 0"
      // regression. Red card, pending-links count, and table query
      // remain untouched.
      this.prisma.transactionHistory.findMany({
        where: {
          createdAt: { gte: dayStart, lt: dayEnd },
          type: LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
          ...(ledgerBranch ?? {}),
        },
        select: { id: true, metadata: true, createdAt: true, orderId: true },
      }),
      // Count of UNPAID, non-canceled orders that already have a hosted URL
      // — still a useful Call-Center workload metric on its own.
      this.prisma.order.count({
        where: {
          cashStatus: CashStatus.UNPAID,
          status: { not: OrderStatus.CANCELED },
          posHostedPaymentUrl: { not: null },
          ...(orderBranch ?? {}),
        },
      }),
    ]);

    // V1.6.4 — strict post-fetch filter: only rows where
    // metadata.debtSettlementViaLink === true contribute to the sum.
    const debtViaLinkRows = todaysLedgerRows.filter((r) =>
      isDebtViaLinkRow(r.metadata),
    );
    const collectedToday = debtViaLinkRows.reduce(
      (acc, r) => acc.plus(extractDebtSettled(r.metadata)),
      new Prisma.Decimal(0),
    );

    // V1.6.5 — 3dp serialization (KWD standard). Keep the `FOUR_DP`
    // helper available for legacy reports that still render 4dp.
    return {
      totalMarketDebtKd: KWD_DP(
        unpaidAgg._sum.totalPrice ?? new Prisma.Decimal(0),
      ),
      debtCollectedTodayKd: KWD_DP(collectedToday),
      pendingLinksCount,
      dayIso: dayIsoLocal,
      branchId: branchId ?? null,
    };
  }

  /**
   * Dastur §5 — Owner Debt Recovery Report.
   * Returns debt-settled KWD per UTC day between `from` and `to` (inclusive).
   * Defaults: last 30 days ending today (UTC).
   */
  async getDebtRecoveryReport(
    fromIso?: string,
    toIso?: string,
  ): Promise<DebtRecoveryReportDto> {
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);

    const toDay = toIso ? parseDayUtc(toIso) : new Date(todayUtc);
    const fromDay = fromIso
      ? parseDayUtc(fromIso)
      : (() => {
          const d = new Date(toDay);
          d.setUTCDate(d.getUTCDate() - 29);
          return d;
        })();

    if (fromDay.getTime() > toDay.getTime()) {
      throw new BadRequestException('`from` must be on or before `to`');
    }

    const windowEnd = new Date(toDay);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 1);

    const rows = await this.prisma.transactionHistory.findMany({
      where: {
        createdAt: { gte: fromDay, lt: windowEnd },
        type: {
          in: [
            LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
            LedgerTransactionType.SUBSCRIPTION_ACTIVATION,
          ],
        },
      },
      select: {
        createdAt: true,
        type: true,
        metadata: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Pre-seed every day in the window so empty days show as zeros
    // (cleaner for sparkline rendering).
    const buckets = new Map<string, DebtRecoveryDayRowDto>();
    for (
      let cursor = new Date(fromDay);
      cursor.getTime() <= toDay.getTime();
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      const key = toIsoDay(cursor);
      buckets.set(key, {
        dayIso: key,
        recoveredKd: '0.0000',
        settlementCount: 0,
        subscriptionCount: 0,
      });
    }

    let total = new Prisma.Decimal(0);
    for (const r of rows) {
      const key = toIsoDay(r.createdAt);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      const debtSettled = extractDebtSettled(r.metadata);
      total = total.plus(debtSettled);
      bucket.recoveredKd = FOUR_DP(
        new Prisma.Decimal(bucket.recoveredKd).plus(debtSettled),
      );
      if (r.type === LedgerTransactionType.ORDER_WALLET_SETTLEMENT) {
        bucket.settlementCount += 1;
      } else {
        bucket.subscriptionCount += 1;
      }
    }

    return {
      from: toIsoDay(fromDay),
      to: toIsoDay(toDay),
      totalRecoveredKd: FOUR_DP(total),
      days: Array.from(buckets.values()),
    };
  }
}
