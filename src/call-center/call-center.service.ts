import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashStatus,
  CustomerSubscriptionStatus,
  GeneralLedgerEntryType,
  LedgerTransactionType,
  OrderStatus,
  PosPaymentMethod,
  Prisma,
} from '@prisma/client';
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
import type { SubscriptionRolloverPreviewDto } from './dto/subscription-rollover-preview.dto';
import type {
  CustomerSubscriptionRowDto,
  SubscriptionInvoiceRowDto,
} from './dto/customer-subscription.dto';
import type { RecordPartialDebtPaymentDto } from './dto/record-partial-debt-payment.dto';
import type {
  CustomerLedgerQueryDto,
  CustomerLedgerEventDto,
  CustomerLedgerEventKind,
  CustomerLedgerInvoiceDto,
  CustomerLedgerResponseDto,
} from './dto/customer-ledger.dto';
import type {
  DailyCollectionsQueryDto,
  DailyCollectionsResponseDto,
  DailyCollectionEventDto,
  DailyCollectionsAgentTotalsDto,
} from './dto/daily-collections.dto';
import type {
  DebtConversionOptionsResponseDto,
  DebtConversionPlanOptionDto,
} from './dto/debt-conversion-options.dto';
import type {
  DailyCollectionsReconciliationQueryDto,
  DailyCollectionsReconciliationResponseDto,
  ReconciliationCheckDto,
  ReconciliationStatus,
} from './dto/daily-collections-reconciliation.dto';

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

/**
 * V19.6 — "Collections-page recovery" predicate. The green KPI card on
 * the Debt-Tracking report must reflect EVERY action a CC agent takes
 * to bring in debt today, not just gateway link callbacks. That includes:
 *
 *   • `debtSettlementViaLink   = true`  → gateway callback finalize
 *     (`PaymentsService.finalizeSinglePaidOrderFromGateway`)
 *   • `debtSettlementViaCallCenter = true` → the "تم الدفع" icon on the
 *     Collections table (`PaymentsService.manuallyMarkOrderPaidByMethod`)
 *   • `debtPaymentOnly         = true`  → CC #1 partial debt payment
 *     (`CustomerLedgerService.recordPartialDebtPayment`)
 *
 * V19.8 — the CC dashboard now renders the two views side by side:
 *
 *   Top KPI tile (`debtCollectedTodayKd`, green card beside the red
 *   "إجمالي الديون السوقية"): BROAD. Sums every ORDER_WALLET_SETTLEMENT
 *   today with `debtSettled > 0` so the green number mirrors the
 *   movement of the red number — manual CC clicks, link callbacks,
 *   driver-led POS completions, AND CC partial debt payments all count.
 *   Subscription-activation debt settlement is intentionally excluded
 *   (that flow converts debt → wallet balance and is surfaced via
 *   `debtRecoveredTodayKd` + the Owner Debt Recovery Report).
 *
 *   Bottom "Daily Collector" panel (`getDailyCollections`): NARROW. Only
 *   the two events a CC agent actively performs — `debtSettlementViaCallCenter`
 *   (the "تم الدفع" icon) and `debtPaymentOnly` (partial debt payment) —
 *   are listed and counted per-agent so a supervisor can tell who
 *   collected what by hand.
 *
 * `isManualCallCenterCollectionRow` stays the narrow predicate used by
 * the bottom panel; the top tile now reduces the broader set directly.
 */
function isManualCallCenterCollectionRow(
  meta: Prisma.JsonValue | null,
): boolean {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return false;
  const m = meta as Record<string, unknown>;
  return (
    m.debtSettlementViaCallCenter === true || m.debtPaymentOnly === true
  );
}

/**
 * V19.4 — CC pack #1 flag introduced by
 * `CustomerLedgerService.recordPartialDebtPayment`. Distinguishes a
 * customer-level partial debt collection (no orderId) from an order
 * settlement that happens to touch debt.
 */
function isPartialDebtPaymentRow(meta: Prisma.JsonValue | null): boolean {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return false;
  return (meta as Record<string, unknown>).debtPaymentOnly === true;
}

/** Extract `debtDiscount` (CC #1 discount portion) from metadata. */
function extractDebtDiscount(meta: Prisma.JsonValue | null): Prisma.Decimal {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return new Prisma.Decimal(0);
  }
  const v = (meta as Record<string, unknown>).debtDiscount;
  if (typeof v !== 'string') return new Prisma.Decimal(0);
  try {
    return new Prisma.Decimal(v);
  } catch {
    return new Prisma.Decimal(0);
  }
}

/** Safe read of string metadata fields (payment method, note, etc.). */
function readMetaString(
  meta: Prisma.JsonValue | null,
  key: string,
): string | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const v = (meta as Record<string, unknown>)[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * V19.4 — CC pack #8/#10/#11. Convert a Kuwait-local YYYY-MM-DD into
 * UTC instants [dayStart, dayEnd) that match the server's other
 * Kuwait-bounded aggregates (debt recovery, operations summary, etc.).
 * Accepts an `end` flag to return the end of the day (useful when the
 * caller wants an inclusive upper bound across a range of days).
 */
function kuwaitDayFromIso(iso: string): { dayStart: Date; dayEnd: Date } {
  const base = parseDayUtc(iso);
  const dayStart = new Date(base.getTime() - KUWAIT_OFFSET_MS);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  return { dayStart, dayEnd };
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

  /**
   * V1.6.9 — Call Center "تم الدفع" confirmation.
   *
   * Flips the order to COMPLETED + PAID_TO_DRIVER, records the method
   * the customer actually used (CASH / KNET / PAYMENT_LINK / ONLINE),
   * and writes an ORDER_WALLET_SETTLEMENT ledger row tagged as a
   * manual debt collection so the Accountant's reports can distinguish
   * these from ordinary POS sales and from gateway-confirmed payments.
   *
   * Idempotent: replaying the call for an already-settled order just
   * returns a snapshot with `alreadySettled:true`.
   */
  async markCollectionOrderPaid(
    orderId: string,
    method: 'CASH' | 'KNET' | 'PAYMENT_LINK' | 'ONLINE',
    performedByUserId: string,
  ) {
    return this.payments.manuallyMarkOrderPaidByMethod({
      orderId,
      method,
      performedByUserId,
    });
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
    // V19.7.1 — lift Prisma's default 5 s transaction budget. The
    // `activateSubscriptionPlan` flow performs ~12 sequential DB calls
    // (wallet resolve, branch origin, per-subscription ledger close +
    // open, wallet update, TH insert, GL append) followed by 3 post-
    // commit lookups here. On a warm DB the chain is ~300 ms, but with
    // connection pool contention or cold caches it crosses 5 s and
    // Prisma aborts with P2028. Aligns with the 10/15 s budget already
    // used by Orders and Payments for the same 3-table atomic write.
    return this.prisma.$transaction(
      async (tx) => {
        const settlement = await this.customerLedger.activateSubscriptionPlan(tx, {
          customerId: dto.customerId,
          planId: dto.planId,
          performedByUserId: userId,
          autoCloseInvoices: dto.autoCloseInvoices === true,
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
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
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
    // V19.7.1 — same reasoning as `activateSubscription`: wallet read +
    // update + TransactionHistory insert is usually fast but shares the
    // same connection pool, so we use the codebase-wide 10/15 s budget
    // to avoid P2028 during mid-call contention.
    return this.prisma.$transaction(
      async (tx) => {
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
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
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
      // recoveries. We fetch today's ORDER_WALLET_SETTLEMENT AND
      // SUBSCRIPTION_ACTIVATION rows for the branch scope, then filter
      // in memory on `metadata.debtSettlementViaLink === true` for the
      // narrow green KPI. The broader set is also used to compute the
      // A3.D10 `debtRecoveredTodayKd` metric which matches the Owner
      // Debt Recovery Report formula exactly (same types, same filter).
      //
      // In-memory filtering avoids Prisma-version-specific quirks with
      // JSONB boolean filters where `{ path: [...], equals: true }` can
      // silently return zero rows on some PostgreSQL + Prisma
      // combinations.
      this.prisma.transactionHistory.findMany({
        where: {
          createdAt: { gte: dayStart, lt: dayEnd },
          type: {
            in: [
              LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
              LedgerTransactionType.SUBSCRIPTION_ACTIVATION,
            ],
          },
          ...(ledgerBranch ?? {}),
        },
        select: {
          id: true,
          type: true,
          metadata: true,
          createdAt: true,
          orderId: true,
        },
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

    // V19.8.1 — Owner directive: the green KPI card beside the red
    // "إجمالي الديون السوقية" tile must mirror the *entire* debt-
    // tracking list. Any event today that reduced the red tile must
    // count here so the two numbers move together.
    //
    // Inclusion (today's TH rows with debtSettled > 0):
    //   • Manual CC "تم الدفع"        (`debtSettlementViaCallCenter`)
    //   • Gateway link auto-callback  (`debtSettlementViaLink`)
    //   • Driver-led POS completion   (ORDER_WALLET_SETTLEMENT, orderId set)
    //   • CC partial debt payment     (`debtPaymentOnly`, orderId null)
    //   • Subscription activation that settled debt via the V19.7.4
    //     FIFO auto-closure flow (the "Convert debt → subscription"
    //     path flips invoices from UNPAID → PAID_TO_DRIVER so the red
    //     tile drops — the green tile must mirror that drop).
    //
    // Excluded rows (intentional):
    //   • TH rows with debtSettled == 0 (no debt movement at all).
    //
    // The narrower "manual-only" total still powers the bottom
    // "Daily Collector" panel — see `getDailyCollections()` — so a
    // supervisor can still tell at a glance who collected what by
    // hand, without conflating the two views.
    // V19.8.1 — single reducer now feeds both exposed totals. The
    // dashboard tile (`debtCollectedTodayKd`) and the Debt Recovery
    // Report quick-view (`debtRecoveredTodayKd`) are identical by
    // definition: every row that reduced customer debt today, no
    // matter the channel, counts toward both. Keeping the two field
    // names for API backwards-compatibility with existing dashboards.
    const recoveredToday = todaysLedgerRows.reduce(
      (acc, r) => acc.plus(extractDebtSettled(r.metadata)),
      new Prisma.Decimal(0),
    );

    // V1.6.5 — 3dp serialization (KWD standard). Keep the `FOUR_DP`
    // helper available for legacy reports that still render 4dp.
    return {
      totalMarketDebtKd: KWD_DP(
        unpaidAgg._sum.totalPrice ?? new Prisma.Decimal(0),
      ),
      debtCollectedTodayKd: KWD_DP(recoveredToday),
      debtRecoveredTodayKd: KWD_DP(recoveredToday),
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

  /**
   * V19.4 — CC pack #2. Preview what a new activation will do BEFORE
   * the operator commits, so the UI modal can ask
   *   "سيتم ترحيل 3.500 د.ك من الاشتراك السابق. هل تريد المتابعة؟"
   *
   * Option 2-A is honoured: even a predecessor that expired months ago
   * still rolls its signed wallet delta forward, because the product
   * decision is to preserve historical debt rather than silently
   * forgive it. The response deliberately mirrors the wallet state at
   * the moment of preview (not the post-activation state) — that final
   * math is the activate call's job.
   */
  async previewSubscriptionRollover(
    customerId: string,
  ): Promise<SubscriptionRolloverPreviewDto> {
    // Defensive FK check: throw a clean 404 instead of a Prisma
    // "record not found" raw error when the CC types a stale uuid.
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const [wallet, previous] = await Promise.all([
      this.prisma.customerWallet.findUnique({
        where: { customerId },
        select: { balance: true, debt: true },
      }),
      this.prisma.customerSubscription.findFirst({
        where: {
          customerId,
          status: {
            in: [
              CustomerSubscriptionStatus.ACTIVE,
              CustomerSubscriptionStatus.EXPIRED,
            ],
          },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          planNameSnapshot: true,
          activatedAt: true,
          expiresAt: true,
        },
      }),
    ]);

    const balance = wallet?.balance ?? new Prisma.Decimal(0);
    const debt = wallet?.debt ?? new Prisma.Decimal(0);
    const carried = balance.minus(debt); // + credit, - debt, 0 even

    if (!previous) {
      return {
        hasPrevious: false,
        currentWalletBalanceKd: balance.toFixed(4),
        currentWalletDebtKd: debt.toFixed(4),
      };
    }

    return {
      hasPrevious: true,
      carriedBalanceKd: carried.toFixed(4),
      previousPlanName: previous.planNameSnapshot,
      previousActivatedAtIso: previous.activatedAt.toISOString(),
      previousExpiresAtIso: previous.expiresAt.toISOString(),
      currentWalletBalanceKd: balance.toFixed(4),
      currentWalletDebtKd: debt.toFixed(4),
    };
  }

  /**
   * V19.4 — CC pack #11 + #12. Full chain of subscriptions for a
   * customer, most-recent first, with every invoice that was issued
   * while each subscription window was ACTIVE. This is what powers the
   * call-center "Subscriptions timeline" view.
   *
   * Performance: two queries (subs + orders in those subs). No N+1 —
   * the orders are batched via `subscriptionId IN (...)` then grouped
   * in memory. A future optimisation is pagination once chains exceed
   * a few hundred entries; today the deepest chain in production is
   * well under that.
   */
  async listCustomerSubscriptionChain(
    customerId: string,
  ): Promise<CustomerSubscriptionRowDto[]> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const subs = await this.prisma.customerSubscription.findMany({
      where: { customerId },
      orderBy: { activatedAt: 'desc' },
    });
    if (subs.length === 0) return [];

    const ids = subs.map((s) => s.id);
    const orders = await this.prisma.order.findMany({
      where: { subscriptionId: { in: ids } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        subscriptionId: true,
        invoiceNumber: true,
        totalPrice: true,
        status: true,
        cashStatus: true,
        createdAt: true,
        completedAt: true,
      },
    });

    const ordersBySub = new Map<string, SubscriptionInvoiceRowDto[]>();
    for (const o of orders) {
      if (!o.subscriptionId) continue;
      const list = ordersBySub.get(o.subscriptionId) ?? [];
      list.push({
        orderId: o.id,
        invoiceNumber: o.invoiceNumber ?? undefined,
        totalPriceKd: o.totalPrice.toFixed(4),
        status: o.status,
        cashStatus: o.cashStatus,
        createdAtIso: o.createdAt.toISOString(),
        completedAtIso: o.completedAt?.toISOString(),
      });
      ordersBySub.set(o.subscriptionId, list);
    }

    return this.mapSubscriptionChainRows(subs, ordersBySub);
  }

  /**
   * V19.4 — CC pack #1. Thin delegate to the ledger service so the
   * controller layer stays transport-only. Returns the post-settlement
   * wallet + a breakdown so the UI toast can say "3.000 د.ك collected,
   * 0.500 د.ك discounted, debt now 2.500 د.ك".
   */
  async recordPartialDebtPayment(
    customerId: string,
    dto: RecordPartialDebtPaymentDto,
    performedByUserId: string,
  ) {
    const method = dto.paymentMethod as PosPaymentMethod;
    return this.customerLedger.recordPartialDebtPayment({
      customerId,
      amountKd: dto.amountKd,
      discountKd: dto.discountKd,
      paymentMethod: method,
      performedByUserId,
      note: dto.note,
    });
  }

  /**
   * V19.4 — CC pack #8 + #10 + #11. Unified "customer 360" ledger.
   *
   * One endpoint powers three Call-Center surfaces:
   *   • #8  Customer report — all invoices + how each was paid.
   *   • #10 Account statement — events with running balance, cut-off chip
   *         for invoices issued against a CUT_OFF subscription.
   *   • #11 Unified timeline — chronological TransactionHistory stream
   *         linking subscriptions, order settlements, and CC partial
   *         debt payments.
   *
   * We deliberately DO NOT fold DebtTransfer rows into the customer
   * stream: those are driver-attribution events that never change the
   * customer's wallet or debt. The agent is meant to see their
   * financial lifecycle, not internal hand-offs.
   */
  async getCustomerLedger(
    customerId: string,
    filters: CustomerLedgerQueryDto,
  ): Promise<CustomerLedgerResponseDto> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        displayName: true,
        phone: true,
        phone2: true,
        originBranchId: true,
        originBranch: { select: { id: true, name: true } },
        wallet: {
          select: { balance: true, debt: true },
        },
      },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Most-recent subscription regardless of status → powers both the
    // "active subscription" card (if status === ACTIVE) and the CUT_OFF
    // banner (#10). The unique index on customerId + createdAt makes
    // this query O(1).
    const latestSub = await this.prisma.customerSubscription.findFirst({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        planNameSnapshot: true,
        planSalePriceSnapshot: true,
        planActualBalanceSnapshot: true,
        planValidityDaysSnapshot: true,
        carriedBalanceKd: true,
        parentSubscriptionId: true,
        activatedAt: true,
        expiresAt: true,
        closedAt: true,
        closedReason: true,
      },
    });

    const fromIso = filters.from ?? null;
    const toIso = filters.to ?? null;
    const dateRange: { gte?: Date; lt?: Date } = {};
    if (fromIso) dateRange.gte = kuwaitDayFromIso(fromIso).dayStart;
    if (toIso) dateRange.lt = kuwaitDayFromIso(toIso).dayEnd;

    const take = Math.min(Math.max(filters.limit ?? 200, 1), 500);
    const skip = Math.max(filters.offset ?? 0, 0);

    const [events, invoices] = await Promise.all([
      this.prisma.transactionHistory.findMany({
        where: {
          customerId,
          ...(dateRange.gte || dateRange.lt
            ? { createdAt: dateRange }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        select: {
          id: true,
          type: true,
          amount: true,
          balanceBefore: true,
          balanceAfter: true,
          debtBefore: true,
          debtAfter: true,
          createdAt: true,
          metadata: true,
          orderId: true,
          subscriptionId: true,
          order: {
            select: {
              id: true,
              serialNumber: true,
              invoiceNumber: true,
              posPaymentMethod: true,
            },
          },
          subscription: {
            select: {
              id: true,
              planNameSnapshot: true,
              status: true,
            },
          },
          performedBy: {
            select: { id: true, fullName: true, safariRole: true },
          },
        },
      }),
      this.prisma.order.findMany({
        where: {
          customerId,
          ...(dateRange.gte || dateRange.lt
            ? { createdAt: dateRange }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        select: {
          id: true,
          serialNumber: true,
          invoiceNumber: true,
          totalPrice: true,
          status: true,
          cashStatus: true,
          posPaymentMethod: true,
          createdAt: true,
          completedAt: true,
          subscriptionId: true,
          subscription: {
            select: {
              id: true,
              planNameSnapshot: true,
              status: true,
            },
          },
          driver: {
            select: {
              id: true,
              fullName: true,
              branch: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    const mappedEvents: CustomerLedgerEventDto[] = events.map((e) => {
      let kind: CustomerLedgerEventKind;
      if (e.type === LedgerTransactionType.SUBSCRIPTION_ACTIVATION) {
        kind = 'SUBSCRIPTION_ACTIVATION';
      } else if (isPartialDebtPaymentRow(e.metadata)) {
        kind = 'PARTIAL_DEBT_PAYMENT';
      } else if (e.orderId) {
        kind = 'ORDER_SETTLEMENT';
      } else {
        // Fallback for legacy rows with ORDER_WALLET_SETTLEMENT type but
        // no orderId — treat as a generic carry/rollover for display.
        kind = 'SUBSCRIPTION_ROLLOVER_CARRY';
      }

      const debtSettled = extractDebtSettled(e.metadata);
      const debtDiscount = extractDebtDiscount(e.metadata);
      const rawMethod =
        readMetaString(e.metadata, 'posPaymentMethod') ??
        readMetaString(e.metadata, 'paymentMethod') ??
        e.order?.posPaymentMethod ??
        null;
      const paymentMethod =
        rawMethod && (Object.values(PosPaymentMethod) as string[]).includes(rawMethod)
          ? (rawMethod as PosPaymentMethod)
          : null;

      return {
        id: e.id,
        atIso: e.createdAt.toISOString(),
        rawType: e.type,
        kind,
        amountKd: FOUR_DP(e.amount),
        balanceBeforeKd: FOUR_DP(e.balanceBefore),
        balanceAfterKd: FOUR_DP(e.balanceAfter),
        debtBeforeKd: FOUR_DP(e.debtBefore),
        debtAfterKd: FOUR_DP(e.debtAfter),
        debtSettledKd: FOUR_DP(debtSettled),
        debtDiscountKd: FOUR_DP(debtDiscount),
        paymentMethod,
        orderId: e.orderId,
        orderSerial: e.order?.serialNumber ?? e.order?.invoiceNumber ?? null,
        subscriptionId: e.subscriptionId,
        subscriptionLabel: e.subscription?.planNameSnapshot ?? null,
        performedByUserId: e.performedBy?.id ?? null,
        performedByName: e.performedBy?.fullName ?? null,
        performedByRole: e.performedBy?.safariRole ?? null,
        note: readMetaString(e.metadata, 'note'),
      };
    });

    const mappedInvoices: CustomerLedgerInvoiceDto[] = invoices.map((o) => {
      const openDebt =
        o.status !== OrderStatus.CANCELED &&
        o.cashStatus === CashStatus.UNPAID;
      return {
        id: o.id,
        serial: o.serialNumber ?? o.invoiceNumber ?? null,
        createdAtIso: o.createdAt.toISOString(),
        completedAtIso: o.completedAt?.toISOString() ?? null,
        totalKd: FOUR_DP(o.totalPrice),
        status: o.status,
        cashStatus: o.cashStatus,
        paymentMethod: o.posPaymentMethod ?? null,
        driverName: o.driver?.fullName ?? null,
        branchName: o.driver?.branch?.name ?? null,
        subscriptionId: o.subscriptionId,
        subscriptionStatus: o.subscription?.status ?? null,
        subscriptionLabel: o.subscription?.planNameSnapshot ?? null,
        issuedWhileCutOff:
          o.subscription?.status === CustomerSubscriptionStatus.CUT_OFF,
        openDebt,
      };
    });

    const totalCollected = mappedEvents.reduce(
      (acc, e) => acc.plus(new Prisma.Decimal(e.debtSettledKd)),
      new Prisma.Decimal(0),
    );
    const totalDiscounted = mappedEvents.reduce(
      (acc, e) => acc.plus(new Prisma.Decimal(e.debtDiscountKd)),
      new Prisma.Decimal(0),
    );
    const openInvoiceCount = mappedInvoices.filter((i) => i.openDebt).length;

    return {
      customer: {
        id: customer.id,
        displayName: customer.displayName ?? null,
        phone: customer.phone ?? null,
        phone2: customer.phone2 ?? null,
        originBranchId: customer.originBranchId ?? null,
        originBranchName: customer.originBranch?.name ?? null,
        walletBalanceKd: FOUR_DP(
          customer.wallet?.balance ?? new Prisma.Decimal(0),
        ),
        walletDebtKd: FOUR_DP(customer.wallet?.debt ?? new Prisma.Decimal(0)),
      },
      activeSubscription:
        latestSub && latestSub.status === CustomerSubscriptionStatus.ACTIVE
          ? {
              id: latestSub.id,
              status: latestSub.status,
              planNameSnapshot: latestSub.planNameSnapshot,
              planSalePriceKd: FOUR_DP(latestSub.planSalePriceSnapshot),
              planActualBalanceKd: FOUR_DP(
                latestSub.planActualBalanceSnapshot,
              ),
              planValidityDays: latestSub.planValidityDaysSnapshot,
              carriedBalanceKd: FOUR_DP(latestSub.carriedBalanceKd),
              parentSubscriptionId: latestSub.parentSubscriptionId,
              activatedAtIso: latestSub.activatedAt.toISOString(),
              expiresAtIso: latestSub.expiresAt.toISOString(),
              closedAtIso: latestSub.closedAt?.toISOString() ?? null,
              closedReason: latestSub.closedReason ?? null,
            }
          : null,
      isCutOff: latestSub?.status === CustomerSubscriptionStatus.CUT_OFF,
      fromIso,
      toIso,
      events: mappedEvents,
      invoices: mappedInvoices,
      totals: {
        eventCount: mappedEvents.length,
        invoiceCount: mappedInvoices.length,
        openInvoiceCount,
        totalCollectedKd: FOUR_DP(totalCollected),
        totalDiscountedKd: FOUR_DP(totalDiscounted),
      },
    };
  }

  /**
   * V19.4 — CC pack #4. "Daily collector" feed powering the Collections
   * page panel. Returns debt-reducing ledger events written between
   * Kuwait 00:00 and 24:00 for the requested day.
   *
   * V19.7 — scope narrowed to "manually collected by the Call Center":
   *   • CC #1 partial debt payments            (metadata.debtPaymentOnly)
   *   • "تم الدفع" manual confirmations         (metadata.debtSettlementViaCallCenter)
   *
   * Excluded (still land in the Recovery Report):
   *   • Pure gateway-callback link payments    (metadata.debtSettlementViaLink
   *     without any manual flag — customer self-service)
   *   • Driver-led wallet settlements with debt
   *
   * Rows with a zero `debtSettled` AND zero `debtDiscount` are always
   * filtered out — they don't belong on a COLLECTION dashboard.
   */
  async getDailyCollections(
    params: DailyCollectionsQueryDto,
  ): Promise<DailyCollectionsResponseDto> {
    const { dayStart, dayEnd, dayIsoLocal } = params.date
      ? (() => {
          const { dayStart, dayEnd } = kuwaitDayFromIso(params.date!);
          return { dayStart, dayEnd, dayIsoLocal: params.date! };
        })()
      : kuwaitDayBounds(new Date());

    const rows = await this.prisma.transactionHistory.findMany({
      where: {
        createdAt: { gte: dayStart, lt: dayEnd },
        type: LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
        ...(params.agentId ? { performedById: params.agentId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        amount: true,
        metadata: true,
        debtAfter: true,
        customer: {
          select: { id: true, displayName: true, phone: true },
        },
        order: {
          select: {
            id: true,
            serialNumber: true,
            invoiceNumber: true,
            posPaymentMethod: true,
            driver: {
              select: {
                id: true,
                fullName: true,
                branch: { select: { id: true, name: true } },
              },
            },
          },
        },
        performedBy: {
          select: { id: true, fullName: true, safariRole: true },
        },
      },
    });

    const events: DailyCollectionEventDto[] = rows
      .map((r): DailyCollectionEventDto | null => {
        const debtSettled = extractDebtSettled(r.metadata);
        const debtDiscount = extractDebtDiscount(r.metadata);
        if (debtSettled.lte(0) && debtDiscount.lte(0)) return null;

        // V19.7 — narrow to manual CC collections per Owner directive.
        // Gateway auto-callbacks and driver-led settlements are excluded
        // from this panel (they still feed the Recovery Report and the
        // broader `debtRecoveredTodayKd`).
        if (!isManualCallCenterCollectionRow(r.metadata)) return null;

        const partial = isPartialDebtPaymentRow(r.metadata);
        const kind: DailyCollectionEventDto['kind'] = partial
          ? 'PARTIAL_DEBT_PAYMENT'
          : 'FULL_ORDER_SETTLEMENT';

        const rawMethod =
          readMetaString(r.metadata, 'posPaymentMethod') ??
          readMetaString(r.metadata, 'paymentMethod') ??
          r.order?.posPaymentMethod ??
          null;
        const paymentMethod =
          rawMethod &&
          (Object.values(PosPaymentMethod) as string[]).includes(rawMethod)
            ? (rawMethod as PosPaymentMethod)
            : null;

        return {
          id: r.id,
          atIso: r.createdAt.toISOString(),
          customerId: r.customer.id,
          customerName: r.customer.displayName ?? null,
          customerPhone: r.customer.phone ?? null,
          orderId: r.order?.id ?? null,
          orderSerial:
            r.order?.serialNumber ?? r.order?.invoiceNumber ?? null,
          amountCollectedKd: FOUR_DP(debtSettled),
          discountAppliedKd: FOUR_DP(debtDiscount),
          paymentMethod,
          kind,
          performedByUserId: r.performedBy?.id ?? null,
          performedByName: r.performedBy?.fullName ?? null,
          performedByRole: r.performedBy?.safariRole ?? null,
          branchName: r.order?.driver?.branch?.name ?? null,
          driverName: r.order?.driver?.fullName ?? null,
          note: readMetaString(r.metadata, 'note'),
          customerDebtAfterKd: FOUR_DP(r.debtAfter),
        };
      })
      .filter((e): e is DailyCollectionEventDto => e !== null);

    const totalCollected = events.reduce(
      (acc, e) => acc.plus(new Prisma.Decimal(e.amountCollectedKd)),
      new Prisma.Decimal(0),
    );
    const totalDiscount = events.reduce(
      (acc, e) => acc.plus(new Prisma.Decimal(e.discountAppliedKd)),
      new Prisma.Decimal(0),
    );
    const uniqueCustomers = new Set(events.map((e) => e.customerId)).size;

    // Group by agent (null agent bucket kept — legacy rows without a
    // performedById still need to appear).
    const byAgentMap = new Map<
      string,
      {
        agentId: string | null;
        agentName: string | null;
        agentRole: DailyCollectionEventDto['performedByRole'];
        eventCount: number;
        customers: Set<string>;
        collected: Prisma.Decimal;
        discount: Prisma.Decimal;
      }
    >();
    for (const e of events) {
      const key = e.performedByUserId ?? '__unattributed__';
      const existing = byAgentMap.get(key);
      if (existing) {
        existing.eventCount += 1;
        existing.customers.add(e.customerId);
        existing.collected = existing.collected.plus(
          new Prisma.Decimal(e.amountCollectedKd),
        );
        existing.discount = existing.discount.plus(
          new Prisma.Decimal(e.discountAppliedKd),
        );
      } else {
        byAgentMap.set(key, {
          agentId: e.performedByUserId,
          agentName: e.performedByName,
          agentRole: e.performedByRole,
          eventCount: 1,
          customers: new Set<string>([e.customerId]),
          collected: new Prisma.Decimal(e.amountCollectedKd),
          discount: new Prisma.Decimal(e.discountAppliedKd),
        });
      }
    }
    const byAgent: DailyCollectionsAgentTotalsDto[] = Array.from(
      byAgentMap.values(),
    )
      .map((v) => ({
        agentId: v.agentId,
        agentName: v.agentName,
        agentRole: v.agentRole,
        eventCount: v.eventCount,
        uniqueCustomers: v.customers.size,
        collectedKd: FOUR_DP(v.collected),
        discountKd: FOUR_DP(v.discount),
      }))
      .sort((a, b) =>
        new Prisma.Decimal(b.collectedKd).comparedTo(
          new Prisma.Decimal(a.collectedKd),
        ),
      );

    return {
      dayIsoLocal,
      dayStartIso: dayStart.toISOString(),
      dayEndIso: dayEnd.toISOString(),
      totals: {
        eventCount: events.length,
        uniqueCustomers,
        collectedKd: FOUR_DP(totalCollected),
        discountKd: FOUR_DP(totalDiscount),
      },
      byAgent,
      events,
    };
  }

  /**
   * V19.5 — CC reconciliation guard. Re-aggregates "Collected Today"
   * KPI totals from BOTH `TransactionHistory` (the read-side) and
   * `GeneralLedgerEntry` (the write-side), then reports the delta.
   *
   * Why both sides? Every debt-reducing write runs inside a Prisma
   * transaction that touches `CustomerWallet`, `TransactionHistory`,
   * AND `GeneralLedgerEntry` atomically (see
   * `CustomerLedgerService.recordPartialDebtPayment` for the reference
   * implementation). In normal operation the two ledgers cannot drift
   * — but if a future code path accidentally writes to one and not the
   * other (e.g. a migration script, a hot patch, a partial rollback),
   * this check is the canary.
   *
   * Three symmetrical checks, one per source pair:
   *   1. Partial debt collected (CC pack #1 cash portion)
   *        TH  = Σ metadata.debtSettled     where debtPaymentOnly=true
   *        GL  = Σ |amount|                 where entryType=DEBT_ADJUSTMENT
   *                                         AND metadata.event=DEBT_COLLECTED
   *                                         AND metadata.source=CC_PARTIAL_DEBT_PAYMENT
   *   2. Partial debt discount (CC pack #1 goodwill portion)
   *        TH  = Σ metadata.debtDiscount    where debtPaymentOnly=true
   *        GL  = Σ |amount|                 where entryType=DEBT_ADJUSTMENT
   *                                         AND metadata.event=DEBT_DISCOUNTED
   *                                         AND metadata.source=CC_PARTIAL_DEBT_PAYMENT
   *   3. Order-level debt settlement via link / call-center-manual
   *        TH  = Σ metadata.debtSettled     where orderId IS NOT NULL
   *                                         AND  (debtSettlementViaLink=true
   *                                              OR reportingCategory=DEBT_COLLECTION_MANUAL)
   *        GL  = Σ POS_SALE_COMPLETED.amount for the same set of orderIds
   *
   * Any check whose |delta| ≥ 0.001 KWD flips `overallStatus` to DRIFT
   * so the UI badge and the daily cron can raise an alert. 0.0005 is
   * rounded-away-from-zero noise from 4dp→3dp tile rendering; 0.001
   * is the smallest real money delta.
   */
  async getDailyCollectionsReconciliation(
    params: DailyCollectionsReconciliationQueryDto,
  ): Promise<DailyCollectionsReconciliationResponseDto> {
    const { dayStart, dayEnd, dayIsoLocal } = params.date
      ? (() => {
          const { dayStart, dayEnd } = kuwaitDayFromIso(params.date!);
          return { dayStart, dayEnd, dayIsoLocal: params.date! };
        })()
      : kuwaitDayBounds(new Date());

    // ─── TransactionHistory side ────────────────────────────────
    const thRows = await this.prisma.transactionHistory.findMany({
      where: {
        createdAt: { gte: dayStart, lt: dayEnd },
        type: LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
      },
      select: { id: true, orderId: true, metadata: true },
    });

    let thPartialCollected = new Prisma.Decimal(0);
    let thPartialDiscount = new Prisma.Decimal(0);
    let thOrderViaLinkCollected = new Prisma.Decimal(0);
    const thOrderViaLinkOrderIds = new Set<string>();

    for (const r of thRows) {
      const debtSettled = extractDebtSettled(r.metadata);
      const debtDiscount = extractDebtDiscount(r.metadata);
      if (isPartialDebtPaymentRow(r.metadata)) {
        thPartialCollected = thPartialCollected.plus(debtSettled);
        thPartialDiscount = thPartialDiscount.plus(debtDiscount);
        continue;
      }
      // Order-level debt settlement: via-link OR call-center-manual.
      if (!r.orderId || debtSettled.lte(0)) continue;
      const viaLink = isDebtViaLinkRow(r.metadata);
      const reportingCategory = readMetaString(
        r.metadata,
        'reportingCategory',
      );
      const manual = reportingCategory === 'DEBT_COLLECTION_MANUAL';
      if (!viaLink && !manual) continue;
      thOrderViaLinkCollected = thOrderViaLinkCollected.plus(debtSettled);
      thOrderViaLinkOrderIds.add(r.orderId);
    }

    // ─── GeneralLedger side ─────────────────────────────────────
    // DEBT_ADJUSTMENT rows carry `metadata.event` and `metadata.source`
    // on every write-site (see the `.append(...)` call-sites). We
    // filter via JSON-path so we stop at exactly the rows the two CC
    // flows produce and ignore unrelated DEBT_ADJUSTMENT writes
    // (e.g. INVOICE_SHORTFALL which is a debt ADDITION, not a reduction).
    const glDebtAdjustments = await this.prisma.generalLedgerEntry.findMany({
      where: {
        createdAt: { gte: dayStart, lt: dayEnd },
        entryType: GeneralLedgerEntryType.DEBT_ADJUSTMENT,
      },
      select: { amount: true, metadata: true },
    });

    let glPartialCollected = new Prisma.Decimal(0);
    let glPartialDiscount = new Prisma.Decimal(0);
    for (const e of glDebtAdjustments) {
      const event = readMetaString(e.metadata, 'event');
      const source = readMetaString(e.metadata, 'source');
      if (source !== 'CC_PARTIAL_DEBT_PAYMENT') continue;
      const abs = e.amount.isNegative() ? e.amount.neg() : e.amount;
      if (event === 'DEBT_COLLECTED') {
        glPartialCollected = glPartialCollected.plus(abs);
      } else if (event === 'DEBT_DISCOUNTED') {
        glPartialDiscount = glPartialDiscount.plus(abs);
      }
    }

    // For the order-level check we match by orderId because the GL row
    // stores the full order total (`POS_SALE_COMPLETED.amount`) which
    // is the same number `metadata.debtSettled` holds on the mirror TH
    // row (gateway flow writes both from `order.totalPrice`).
    let glOrderViaLinkCollected = new Prisma.Decimal(0);
    if (thOrderViaLinkOrderIds.size > 0) {
      const glOrderRows = await this.prisma.generalLedgerEntry.findMany({
        where: {
          createdAt: { gte: dayStart, lt: dayEnd },
          entryType: GeneralLedgerEntryType.POS_SALE_COMPLETED,
          orderId: { in: Array.from(thOrderViaLinkOrderIds) },
        },
        select: { amount: true },
      });
      for (const e of glOrderRows) {
        glOrderViaLinkCollected = glOrderViaLinkCollected.plus(e.amount);
      }
    }

    // ─── Deltas + status ────────────────────────────────────────
    const DRIFT_THRESHOLD = new Prisma.Decimal('0.001');
    const classify = (delta: Prisma.Decimal): ReconciliationStatus => {
      const abs = delta.isNegative() ? delta.neg() : delta;
      return abs.gte(DRIFT_THRESHOLD) ? 'DRIFT' : 'MATCH';
    };

    const d1 = glPartialCollected.minus(thPartialCollected);
    const d2 = glPartialDiscount.minus(thPartialDiscount);
    const d3 = glOrderViaLinkCollected.minus(thOrderViaLinkCollected);

    const checks: ReconciliationCheckDto[] = [
      {
        id: 'partialDebtCollected',
        status: classify(d1),
        transactionHistoryKd: FOUR_DP(thPartialCollected),
        generalLedgerKd: FOUR_DP(glPartialCollected),
        deltaKd: FOUR_DP(d1),
        note: 'TH(debtPaymentOnly=true).debtSettled vs GL(DEBT_ADJUSTMENT.event=DEBT_COLLECTED, source=CC_PARTIAL_DEBT_PAYMENT)',
      },
      {
        id: 'partialDebtDiscount',
        status: classify(d2),
        transactionHistoryKd: FOUR_DP(thPartialDiscount),
        generalLedgerKd: FOUR_DP(glPartialDiscount),
        deltaKd: FOUR_DP(d2),
        note: 'TH(debtPaymentOnly=true).debtDiscount vs GL(DEBT_ADJUSTMENT.event=DEBT_DISCOUNTED, source=CC_PARTIAL_DEBT_PAYMENT)',
      },
      {
        id: 'orderViaLinkCollected',
        status: classify(d3),
        transactionHistoryKd: FOUR_DP(thOrderViaLinkCollected),
        generalLedgerKd: FOUR_DP(glOrderViaLinkCollected),
        deltaKd: FOUR_DP(d3),
        note: 'TH(orderId set, debtSettlementViaLink OR reportingCategory=DEBT_COLLECTION_MANUAL).debtSettled vs GL(POS_SALE_COMPLETED) joined by orderId',
      },
    ];

    const overallStatus: ReconciliationStatus = checks.some(
      (c) => c.status === 'DRIFT',
    )
      ? 'DRIFT'
      : 'MATCH';

    return {
      dayIsoLocal,
      dayStartIso: dayStart.toISOString(),
      dayEndIso: dayEnd.toISOString(),
      overallStatus,
      checks,
      totals: {
        transactionHistory: {
          collectedKd: FOUR_DP(
            thPartialCollected.plus(thOrderViaLinkCollected),
          ),
          discountKd: FOUR_DP(thPartialDiscount),
        },
        generalLedger: {
          collectedKd: FOUR_DP(
            glPartialCollected.plus(glOrderViaLinkCollected),
          ),
          discountKd: FOUR_DP(glPartialDiscount),
        },
      },
      generatedAtIso: new Date().toISOString(),
    };
  }

  /**
   * V19.4 — CC pack #9. Preview what each active subscription plan
   * would do to a customer's debt + wallet if activated right now.
   *
   * The arithmetic here MUST stay byte-identical to the atomic
   * `CustomerLedgerService.activateSubscriptionPlan` flow, otherwise
   * the preview and the committed result will disagree and the agent
   * will lose trust. That's why we re-derive from the same inputs:
   *   debtToSettle = min(currentDebt, planSalePrice)
   *   creditedToBalance = max(0, planActualBalance − debtToSettle)
   *   newBalance = currentBalance + creditedToBalance
   *   newDebt = currentDebt − debtToSettle
   *   subsidy = max(0, planActualBalance − planSalePrice)
   * No persistence, no transaction — pure read.
   */
  async getDebtConversionOptions(
    customerId: string,
  ): Promise<DebtConversionOptionsResponseDto> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        wallet: { select: { balance: true, debt: true } },
      },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const plans = await this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: [{ salePrice: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        salePrice: true,
        actualBalance: true,
        validityDays: true,
      },
    });

    const currentBalance =
      customer.wallet?.balance ?? new Prisma.Decimal(0);
    const currentDebt = customer.wallet?.debt ?? new Prisma.Decimal(0);
    const zero = new Prisma.Decimal(0);

    const options: DebtConversionPlanOptionDto[] = plans.map((p) => {
      // V19.7.3 — mirror `activateSubscriptionPlan`: the CREDIT amount
      // (`actualBalance`), not the sale price, is what offsets
      // existing debt. Keeping this read-only preview in lock-step
      // with the write path is critical — any drift between the
      // dialog's projected numbers and the post-commit numbers would
      // re-introduce the exact "Convert" bug the owner just flagged.
      // All arithmetic stays on Prisma.Decimal to avoid FP drift.
      const debtToSettle = currentDebt.lt(p.actualBalance)
        ? currentDebt
        : p.actualBalance;
      const remainingDebt = currentDebt.minus(debtToSettle);
      const rawCredit = p.actualBalance.minus(debtToSettle);
      const creditedToBalance = rawCredit.gt(0) ? rawCredit : zero;
      const projectedBalance = currentBalance.plus(creditedToBalance);
      const subsidy = p.actualBalance.gt(p.salePrice)
        ? p.actualBalance.minus(p.salePrice)
        : zero;

      const convertsDebt = debtToSettle.gt(0);
      const clearsAllDebt = currentDebt.gt(0) && remainingDebt.lte(0);
      const recommended =
        currentDebt.gt(0) && p.actualBalance.gte(currentDebt);

      return {
        planId: p.id,
        planName: p.name,
        planValidityDays: p.validityDays,
        cashRequiredKd: FOUR_DP(p.salePrice),
        planActualBalanceKd: FOUR_DP(p.actualBalance),
        debtToSettleKd: FOUR_DP(debtToSettle),
        remainingDebtKd: FOUR_DP(remainingDebt),
        creditedToBalanceKd: FOUR_DP(creditedToBalance),
        projectedWalletBalanceKd: FOUR_DP(projectedBalance),
        projectedWalletDebtKd: FOUR_DP(remainingDebt),
        subsidyKd: FOUR_DP(subsidy),
        convertsDebt,
        clearsAllDebt,
        recommended,
      };
    });

    return {
      customerId: customer.id,
      currentDebtKd: FOUR_DP(currentDebt),
      currentBalanceKd: FOUR_DP(currentBalance),
      hasDebt: currentDebt.gt(0),
      options,
    };
  }

  /** Shared mapper so #2 chain list + #12 single-detail stay DRY. */
  private mapSubscriptionChainRows(
    subs: Array<{
      id: string;
      status: CustomerSubscriptionStatus;
      planNameSnapshot: string;
      planSalePriceSnapshot: Prisma.Decimal;
      planActualBalanceSnapshot: Prisma.Decimal;
      planValidityDaysSnapshot: number;
      carriedBalanceKd: Prisma.Decimal;
      parentSubscriptionId: string | null;
      activatedAt: Date;
      expiresAt: Date;
      closedAt: Date | null;
      closedReason: string | null;
    }>,
    ordersBySub: Map<string, SubscriptionInvoiceRowDto[]>,
  ): CustomerSubscriptionRowDto[] {
    return subs.map<CustomerSubscriptionRowDto>((s) => ({
      id: s.id,
      status: s.status,
      planNameSnapshot: s.planNameSnapshot,
      planSalePriceSnapshot: s.planSalePriceSnapshot.toFixed(4),
      planActualBalanceSnapshot: s.planActualBalanceSnapshot.toFixed(4),
      planValidityDaysSnapshot: s.planValidityDaysSnapshot,
      carriedBalanceKd: s.carriedBalanceKd.toFixed(4),
      parentSubscriptionId: s.parentSubscriptionId ?? undefined,
      activatedAtIso: s.activatedAt.toISOString(),
      expiresAtIso: s.expiresAt.toISOString(),
      closedAtIso: s.closedAt?.toISOString(),
      closedReason: s.closedReason ?? undefined,
      invoices: ordersBySub.get(s.id) ?? [],
    }));
  }
}
