import {
  BadRequestException,
  ForbiddenException,
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
  SafariRole,
} from '@prisma/client';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { logServerError } from '../common/filters/prisma-exception.util';
import { CustomerLedgerService } from '../customer-ledger/customer-ledger.service';
import { PaymentsService } from '../common/services/payments.service';
import { CustomerNotificationsService } from '../customer-notifications/customer-notifications.service';
import { DebtService } from '../finance/services/debt.service';
import { DebtVisibilityService } from '../finance/debt-visibility/debt-visibility.service';
import { OrdersService } from '../orders/orders.service';
import { resolveCustomerPhoneForNotify } from '../common/validation/kuwait-customer-phone';
import { buildCollectionsPaymentLinkTextAr } from './collections-whatsapp-text';
import type { SendPaymentLinkWhatsappResultDto } from './dto/send-payment-link-whatsapp.dto';
import { ActivateSubscriptionDto } from './dto/activate-subscription.dto';
import { CancelSubscriptionDto } from './dto/cancel-subscription.dto';
import { ExtendSubscriptionDto } from './dto/extend-subscription.dto';
import type { SettlementHistoryRowDto } from './dto/settlement-history-row.dto';
import type { CallCenterOperationsSummaryDto } from './dto/operations-summary.dto';
import type {
  DebtRecoveryDayRowDto,
  DebtRecoveryReportDto,
} from './dto/debt-recovery-report.dto';
import { computeCanonicalDebtRecoverySummary } from '../finance/canonical-financial-projection';
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
import {
  canonicalStatementInvoiceGroup,
  computeCanonicalStatementEventProjection,
  computeCanonicalStatementTotals,
} from '../finance/canonical-financial-projection';
import {
  buildCanonicalSnapshot,
  CANONICAL_SNAPSHOT_VERSION,
} from '../finance/canonical-snapshot';

/** Block call-center duplicate WA only inside the 2.5h cooldown when the field already notified. */
function assertCallCenterMaySendCollectionPaymentWa(
  ccCollectionPaymentWaLocked: boolean,
  actor: JwtUser,
  lastReminderAt: Date | null,
  now: Date,
): void {
  const cooldownElapsed =
    lastReminderAt === null ||
    now.getTime() - lastReminderAt.getTime() >= ORDER_REMINDER_COOLDOWN_MS;
  if (cooldownElapsed) {
    return;
  }
  if (
    !ccCollectionPaymentWaLocked ||
    (actor.role !== SafariRole.CALL_CENTER &&
      actor.role !== SafariRole.CALL_CENTER_SUPERVISOR)
  ) {
    return;
  }
  throw new ForbiddenException(
    'تم إرسال رابط الدفع للعميل من الميدان (سائق/مدير فرع). لا يمكن لمركز الاتصال إرسال تذكير واتساب إضافي لتفادي إزعاج العميل.',
  );
}

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

/** Kuwait-local calendar date (YYYY-MM-DD) for an absolute instant. */
function toKuwaitIsoDay(d: Date): string {
  const shifted = new Date(d.getTime() + KUWAIT_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const mo = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  return `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Kuwait-local calendar YYYY-MM-DD at 00:00 → stored UTC instant
 * (same convention as `kuwaitDayBounds` / Collections KPIs).
 */
function parseKuwaitCalendarDateStart(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) {
    throw new BadRequestException(`Invalid date: ${iso}`);
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return new Date(Date.UTC(y, mo - 1, d) - KUWAIT_OFFSET_MS);
}

function addKuwaitCalendarDays(isoYmd: string, deltaDays: number): string {
  const start = parseKuwaitCalendarDateStart(isoYmd);
  return toKuwaitIsoDay(new Date(start.getTime() + deltaDays * 86400000));
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
  if (typeof v === 'string' && v.trim()) {
    try {
      return new Prisma.Decimal(v);
    } catch {
      return new Prisma.Decimal(0);
    }
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    try {
      return new Prisma.Decimal(v);
    } catch {
      return new Prisma.Decimal(0);
    }
  }
  return new Prisma.Decimal(0);
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
 * V19.8.3 — pull a list of stringy IDs out of a metadata blob. Used to
 * recover `autoClosedInvoiceIds` (written by the activation path in
 * V19.7.4) when rendering the customer statement. Silently tolerates
 * missing / malformed entries — a single bad element must not break
 * the whole customer ledger fetch.
 */
function readMetaStringArray(
  meta: Prisma.JsonValue | null,
  key: string,
): string[] {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return [];
  const v = (meta as Record<string, unknown>)[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

function parseMetaAppliedFromWallet(
  meta: Prisma.JsonValue | null,
): Prisma.Decimal {
  const s = readMetaString(meta, 'appliedFromWallet');
  if (!s) return new Prisma.Decimal(0);
  try {
    const d = new Prisma.Decimal(s);
    return d.lt(0) ? new Prisma.Decimal(0) : d;
  } catch {
    return new Prisma.Decimal(0);
  }
}

/**
 * V19.26 — Statement labels: «تسوية» only when the invoice is paid from
 * subscription wallet; full cash/online/link → «فاتورة مدفوعة»; wallet +
 * external on the same invoice → «تسديد جزئي».
 */
function classifyOrderWalletLedgerKind(
  meta: Prisma.JsonValue | null,
  paymentMethod: PosPaymentMethod | null,
): CustomerLedgerEventKind {
  const applied = parseMetaAppliedFromWallet(meta);
  const externalMethods: ReadonlySet<PosPaymentMethod> = new Set([
    PosPaymentMethod.CASH,
    PosPaymentMethod.KNET,
    PosPaymentMethod.ONLINE,
    PosPaymentMethod.PAYMENT_LINK,
  ]);

  if (paymentMethod === PosPaymentMethod.SUBSCRIPTION_WALLET) {
    return 'ORDER_SETTLEMENT_SUBSCRIPTION';
  }

  if (paymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT) {
    return 'ORDER_INVOICE_ON_ACCOUNT';
  }

  if (paymentMethod && externalMethods.has(paymentMethod)) {
    return applied.gt(0)
      ? 'ORDER_INVOICE_PARTIAL_PAYMENT'
      : 'ORDER_PAID_IN_FULL';
  }

  if (applied.gt(0)) {
    return 'ORDER_SETTLEMENT_SUBSCRIPTION';
  }

  return 'ORDER_PAID_IN_FULL';
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
  // DEGRADE-2: In-memory statement token revocation blacklist.
  // Persists for the lifetime of the process. Operators can revoke
  // a token by calling revokeStatementToken(); the blacklist is
  // checked in getPublicStatement() before serving any data.
  // For production deployments spanning multiple instances, replace
  // with a Redis SET (TTL = 7d) keyed on the JTI claim.
  private readonly revokedTokenJtis = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly customerLedger: CustomerLedgerService,
    private readonly payments: PaymentsService,
    private readonly jwt: JwtService,
    private readonly orders: OrdersService,
    private readonly customerNotifications: CustomerNotificationsService,
    private readonly debt: DebtService,
    private readonly debtVisibility: DebtVisibilityService,
  ) {}

  /**
   * MANAGER: order must belong to the manager's branch. DRIVER: their own
   * invoices only. All other roles skip the check.
   */
  private async assertOrderInCollectionScope(
    orderId: string,
    actor: JwtUser,
  ): Promise<void> {
    // OWNER and CC_SUPERVISOR have unrestricted access by design (documented).
    if (
      actor.role === SafariRole.OWNER ||
      actor.role === SafariRole.CALL_CENTER_SUPERVISOR
    ) {
      return;
    }

    // STEAL-3: CALL_CENTER now gets the same branch-scoping as MANAGER.
    // Only DRIVER, MANAGER, and CALL_CENTER are subject to the check;
    // all other roles pass through unchanged (existing behaviour).
    if (
      actor.role !== SafariRole.DRIVER &&
      actor.role !== SafariRole.MANAGER &&
      actor.role !== SafariRole.CALL_CENTER
    ) {
      return;
    }

    const o = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        driverId: true,
        driver: { select: { branchId: true } },
        customer: { select: { originBranchId: true } },
      },
    });
    if (!o) {
      throw new NotFoundException('Order not found');
    }

    if (actor.role === SafariRole.DRIVER) {
      if (o.driverId !== actor.userId) {
        throw new ForbiddenException(
          'This invoice is not assigned to you for follow-up',
        );
      }
      return;
    }

    // MANAGER and CALL_CENTER: must be in the order's branch
    // (driver.branchId or customer.originBranchId — same logic as MANAGER).
    const b = actor.branchId;
    if (!b) {
      // If actor has no branch, we cannot scope — allow through.
      return;
    }
    const inBranch =
      (o.driverId && o.driver?.branchId === b) ||
      (!o.driverId && o.customer?.originBranchId === b);
    if (!inBranch) {
      throw new ForbiddenException('This invoice is outside your branch scope');
    }
  }

  /**
   * V19.8.9 — Issue a short-lived, signed share link for a customer's
   * statement so the Call Center can forward it over WhatsApp. The
   * token embeds `customerId` plus optional `from` / `to` Kuwait-local
   * filters and lives for 7 days (long enough for a customer to act
   * on a reminder, short enough that an accidentally-leaked URL
   * expires on its own). Holder of the URL does NOT get access to
   * anything else: every call to `getPublicStatement(token)` is
   * verified and scoped back to the embedded customer.
   */
  async createStatementShareToken(
    customerId: string,
    params: { from?: string | null; to?: string | null; publicBaseUrl: string },
  ): Promise<{ token: string; jti: string; shareUrl: string; expiresAtIso: string }> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    // DEGRADE-2: embed a JTI (JWT ID) so individual tokens can be revoked.
    const jti = `stmt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const payload = {
      purpose: 'STATEMENT_SHARE' as const,
      customerId,
      jti,
      from: params.from || undefined,
      to: params.to || undefined,
    };
    const token = await this.jwt.signAsync(payload, { expiresIn: '7d' });
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const base = params.publicBaseUrl.replace(/\/$/, '');
    const shareUrl = `${base}/public/statement/${token}`;
    return {
      token,
      jti,
      shareUrl,
      expiresAtIso: expiresAt.toISOString(),
    };
  }

  /**
   * DEGRADE-2: Revoke a statement share token by its JTI.
   * After revocation, `getPublicStatement` will reject this token.
   */
  revokeStatementToken(jti: string): void {
    this.revokedTokenJtis.add(jti);
  }

  /**
   * V19.8.9 — Resolve a share token into the same ledger payload the
   * authenticated endpoint returns. Verifies the signature, the
   * `purpose` claim, and re-scopes the request to the embedded
   * `customerId` so a leaked/malformed token cannot be used to peek
   * at other customers' data by swapping IDs in the URL.
   */
  async getPublicStatement(token: string): Promise<CustomerLedgerResponseDto> {
    let payload: {
      purpose?: string;
      customerId?: string;
      jti?: string;
      from?: string;
      to?: string;
    };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new NotFoundException('رابط الكشف غير صالح أو منتهي الصلاحية');
    }
    if (payload.purpose !== 'STATEMENT_SHARE' || !payload.customerId) {
      throw new NotFoundException('رابط الكشف غير صالح');
    }
    // DEGRADE-2: reject revoked tokens.
    if (payload.jti && this.revokedTokenJtis.has(payload.jti)) {
      throw new NotFoundException('رابط الكشف تم إلغاؤه');
    }
    return this.getCustomerLedger(payload.customerId, {
      from: payload.from,
      to: payload.to,
      limit: 500,
    });
  }

  /**
   * V1.6.0 — on-demand payment link for ANY unpaid order (Cash, KNET,
   * DEBT_ON_ACCOUNT, …). Called by the "Payment link" button on the
   * Collections page so the agent does not need to pre-create links at
   * POS time. When the callback from the gateway lands,
   * `finalizeSinglePaidOrderFromGateway` will auto-switch the method to
   * ONLINE and tag the row as a debt settlement via link.
   */
  async ensureOrderPaymentLink(
    orderId: string,
    actor: JwtUser,
  ): Promise<{ url: string }> {
    await this.assertOrderInCollectionScope(orderId, actor);
    const link = await this.payments.ensurePaymentLinkForUnpaidOrder(orderId);
    return { url: link.url };
  }

  /**
   * Mint/refresh hosted URL, apply reminder/cooldown, then push the same
   * Collections Arabic text through Moatmt or CUSTOMER_NOTIFY_WEBHOOK_URL so
   * the customer receives the link without a manual WhatsApp "Send" tap.
   * When no server channel is configured, the caller should open `wa.me`.
   */
  async sendPaymentLinkToCustomerWhatsapp(
    orderId: string,
    actor: JwtUser,
  ): Promise<SendPaymentLinkWhatsappResultDto> {
    await this.assertOrderInCollectionScope(orderId, actor);
    const lockRow = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { ccCollectionPaymentWaLocked: true, lastReminderAt: true },
    });
    assertCallCenterMaySendCollectionPaymentWa(
      lockRow?.ccCollectionPaymentWaLocked ?? false,
      actor,
      lockRow?.lastReminderAt ?? null,
      new Date(),
    );
    const link = await this.payments.ensurePaymentLinkForUnpaidOrder(orderId);
    const reminder = await this.sendOrderReminder(orderId, actor);
    if (!reminder.sent) {
      return { reminder, serverPush: false, paymentUrl: link.url };
    }
    const snap =
      await this.orders.getUnpaidCollectionOrderRowForWhatsappText(orderId);
    if (!snap) {
      throw new BadRequestException(
        'Order is not open for collection messaging (settled, canceled, or not found).',
      );
    }
    const to = resolveCustomerPhoneForNotify(
      snap.customerPhone,
      snap.customerPhone2,
    );
    if (!to.trim()) {
      throw new BadRequestException('No customer phone on file for this order');
    }
    const message = buildCollectionsPaymentLinkTextAr(snap, link.url);
    const serverPush = await this.customerNotifications.deliverCollectionsPaymentLinkNow(
      {
        customerPhone: to,
        orderId: snap.orderId,
        message,
      },
    );
    return { reminder, serverPush, paymentUrl: link.url };
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
    actor: JwtUser,
  ) {
    await this.assertOrderInCollectionScope(orderId, actor);
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
    // DEGRADE-3: run activation AND prepaid FIFO auto-reconcile in a single
    // atomic transaction. If reconcile fails, the activation rolls back too,
    // preventing a state where the wallet has new credit but open invoices
    // remain unpaid. Use the Tx-accepting helper directly.
    const { core, prepaidAutoReconciledOrderIds } = await this.prisma.$transaction(
      async (tx) => {
        const settlement = await this.customerLedger.activateSubscriptionPlan(tx, {
          customerId: dto.customerId,
          planId: dto.planId,
          performedByUserId: userId,
          autoCloseInvoices: dto.autoCloseInvoices === true,
          paymentMethod: dto.paymentMethod,
          skipPrepaidAutoReconcile: true,
          // V25 Deposit-then-Settle: forward optional company support override.
          companySupportAmountKd: dto.companySupportAmountKd,
        });

        // Run reconcile inside the same tx so both succeed or both roll back.
        const reconcile = await this.customerLedger
          .autoReconcileUnpaidInvoicesFromPrepaidBalanceTx(tx, dto.customerId, userId);

        const customer = await tx.customer.findUniqueOrThrow({
          where: { id: dto.customerId },
          select: {
            id: true,
            phone: true,
            phone2: true,
            address: true,
            displayName: true,
          },
        });
        const plan = await tx.subscriptionPlan.findUniqueOrThrow({
          where: { id: dto.planId },
        });
        const wallet = await tx.customerWallet.findUniqueOrThrow({
          where: { customerId: dto.customerId },
        });
        return {
          core: {
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
          },
          prepaidAutoReconciledOrderIds: reconcile.paidOrderIds,
        };
      },
      { maxWait: 20_000, timeout: 90_000 },
    );

    const walletFinal = await this.prisma.customerWallet.findUniqueOrThrow({
      where: { customerId: dto.customerId },
      select: { balance: true, debt: true, subscriptionExpiresAt: true },
    });

    this.customerLedger.emitFinancialEvent('finance.subscription.activated', {
      customerId: dto.customerId,
      orderId: null,
      correlationId: core.settlement.subscriptionId,
      occurredAt: new Date().toISOString(),
      planId: core.plan.id,
      expiresAt: walletFinal.subscriptionExpiresAt?.toISOString() ?? new Date().toISOString(),
    });

    return {
      customer: core.customer,
      plan: core.plan,
      wallet: {
        balance: walletFinal.balance.toString(),
        debt: walletFinal.debt.toString(),
      },
      settlement: {
        ...core.settlement,
        prepaidAutoReconciledOrderIds,
        newBalance: walletFinal.balance.toString(),
        newDebt: walletFinal.debt.toString(),
      },
    };
  }

  /**
   * Early subscription cancellation: time-proportional separation of paid
   * (cash-refund leg) vs promotional credit (voided, never paid as cash).
   * See `{@link CustomerLedgerService.cancelSubscriptionForCustomer}`.
   */
  async cancelActiveSubscription(
    userId: string,
    dto: CancelSubscriptionDto,
  ) {
    return this.prisma.$transaction(
      async (tx) =>
        this.customerLedger.cancelSubscriptionForCustomer(tx, {
          customerId: dto.customerId,
          performedByUserId: userId,
          reason: dto.reason?.trim() || null,
        }),
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
  async sendOrderReminder(
    orderId: string,
    actor: JwtUser,
  ): Promise<ReminderResultDto> {
    await this.assertOrderInCollectionScope(orderId, actor);
    const lockRow = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { ccCollectionPaymentWaLocked: true, lastReminderAt: true },
    });
    assertCallCenterMaySendCollectionPaymentWa(
      lockRow?.ccCollectionPaymentWaLocked ?? false,
      actor,
      lockRow?.lastReminderAt ?? null,
      new Date(),
    );
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
    actor?: JwtUser | null,
  ): Promise<CallCenterOperationsSummaryDto> {
    // V1.6.1 — strictly sum [Kuwait 00:00 today → now]. At 00:00 Kuwait
    // local time the KPI naturally resets because `createdAt` is compared
    // against fresh midnight bounds on every request.
    const now = new Date();
    const { dayStart, dayEnd, dayIsoLocal } = kuwaitDayBounds(now);

    const isDriver = actor?.role === SafariRole.DRIVER;
    const effectiveBranchId =
      isDriver ? null
      : branchId ??
        (actor?.role === SafariRole.MANAGER && actor.branchId ?
          actor.branchId
        : null);

    const orderBranch = isDriver && actor
      ? { driverId: actor.userId }
      : (orderBranchWhere(effectiveBranchId) ?? {});

    const ledgerBranchFilter =
      isDriver && actor
        ? { order: { driverId: actor.userId } }
        : effectiveBranchId
          ? { branchId: effectiveBranchId }
          : {};

    // V1.6.6 (A-48 fix) — Scope for TransactionHistory. TH has no direct
    // branchId column, so we filter through the related Order using the
    // same branch predicate as the red card (`orderBranchWhere`). For
    // drivers we narrow to their own orders. When neither applies, we sum
    // globally. We use the `is:` filter form because `order` is a nullable
    // relation on TransactionHistory.
    const orderBranchScope = orderBranchWhere(effectiveBranchId);
    const transactionOrderScope: Prisma.TransactionHistoryWhereInput =
      isDriver && actor
        ? { order: { is: { driverId: actor.userId } } }
        : orderBranchScope
          ? { order: { is: orderBranchScope } }
          : {};
    // Red card: same predicate as collections/unpaid for this actor. Green:
    //   Σ `metadata.debtSettled` across ORDER_WALLET_SETTLEMENT rows today.
    //   This matches the DTO contract and captures gateway-link finalizes,
    //   manual "تم الدفع" in Collections, CC partial-debt payments, AND
    //   driver-led POS completions that settled open debt — exactly the
    //   behaviour the Green "المحصل اليوم" card is supposed to mirror.
    //   (Prior implementation summed DebtLedgerEntry.PAYMENT amounts which
    //   only fire when a pre-existing debt is paid down, so fresh ONLINE
    //   payment-link sales never surfaced on the card — see bug A-48.)

    // Red KPI: banking-core visibility facade only. Do not aggregate
    // orders here; the facade owns the canonical customer debt read.
    const [
      collectionsSnapshot,
      todaysSettlementRows,
      todaysSubscriptionActivationRows,
      pendingLinksCount,
      pendingLinksAggregate,
      ledgerDebtSplit,
    ] = await Promise.all([
      this.debtVisibility.getCollectionsSnapshot(),
      this.prisma.transactionHistory.findMany({
        where: {
          type: LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
          createdAt: { gte: dayStart, lt: dayEnd },
          ...transactionOrderScope,
        },
        select: { metadata: true },
      }),
      this.prisma.transactionHistory.findMany({
        where: {
          type: LedgerTransactionType.SUBSCRIPTION_ACTIVATION,
          createdAt: { gte: dayStart, lt: dayEnd },
          ...transactionOrderScope,
        },
        select: { metadata: true },
      }),
      this.prisma.order.count({
        where: {
          cashStatus: CashStatus.UNPAID,
          status: { not: OrderStatus.CANCELED },
          posHostedPaymentUrl: { not: null },
          ...orderBranch,
        },
      }),
      this.prisma.order.aggregate({
        where: {
          cashStatus: CashStatus.UNPAID,
          status: { not: OrderStatus.CANCELED },
          posHostedPaymentUrl: { not: null },
          ...orderBranch,
        },
        _sum: { totalPrice: true },
      }),
      this.debt.getLedgerOpenDebtByCategory(ledgerBranchFilter),
    ]);

    // Green card (broad) — every ORDER_WALLET_SETTLEMENT row today that
    // carries a positive `metadata.debtSettled`. Covers:
    //   • Gateway callback finalize (`debtSettlementViaLink=true`)
    //   • Collections "تم الدفع" (`debtSettlementViaCallCenter=true`)
    //   • CC partial debt payment (`debtPaymentOnly=true`)
    //   • Any driver-led POS completion that set `debtSettled` on its row
    let collectedTodayFromOrders = new Prisma.Decimal(0);
    let linkCollectedToday = new Prisma.Decimal(0);
    for (const r of todaysSettlementRows) {
      const debtSettled = extractDebtSettled(r.metadata);
      if (debtSettled.gt(0)) {
        collectedTodayFromOrders = collectedTodayFromOrders.plus(debtSettled);
        if (isDebtViaLinkRow(r.metadata)) {
          linkCollectedToday = linkCollectedToday.plus(debtSettled);
        }
      }
    }

    // Broader recovery number — also includes subscription activations
    // that retired legacy debt (per DTO contract for
    // `debtRecoveredTodayKd`, A3.D10 Owner Debt Recovery Report formula).
    let subscriptionActivationDebtToday = new Prisma.Decimal(0);
    for (const r of todaysSubscriptionActivationRows) {
      const debtSettled = extractDebtSettled(r.metadata);
      if (debtSettled.gt(0)) {
        subscriptionActivationDebtToday =
          subscriptionActivationDebtToday.plus(debtSettled);
      }
    }
    const recoveredToday = collectedTodayFromOrders.plus(
      subscriptionActivationDebtToday,
    );

    return {
      totalMarketDebtKd: KWD_DP(
        new Prisma.Decimal(collectionsSnapshot.totalRemainingDebtKd),
      ),
      outstandingInvoiceDebtKd: KWD_DP(
        new Prisma.Decimal(ledgerDebtSplit.outstandingInvoiceDebtKd),
      ),
      outstandingSubscriptionDebtKd: KWD_DP(
        new Prisma.Decimal(ledgerDebtSplit.outstandingSubscriptionDebtKd),
      ),
      debtCollectedTodayKd: KWD_DP(collectedTodayFromOrders),
      linkCollectedTodayKd: KWD_DP(linkCollectedToday),
      debtRecoveredTodayKd: KWD_DP(recoveredToday),
      pendingLinksCount,
      pendingLinksKd: KWD_DP(
        pendingLinksAggregate._sum.totalPrice ?? new Prisma.Decimal(0),
      ),
      dayIso: dayIsoLocal,
      branchId: effectiveBranchId ?? null,
    };
  }

  /**
   * Dastur §5 — Owner Debt Recovery Report.
   * Returns debt-settled KWD per **Kuwait-local** calendar day between
   * `from` and `to` (inclusive). Defaults: last 30 Kuwait days ending
   * today (Kuwait), aligned with Collections / «محصل اليوم» semantics.
   */
  async getDebtRecoveryReport(
    fromIso?: string,
    toIso?: string,
  ): Promise<DebtRecoveryReportDto> {
    const todayKuwait = toKuwaitIsoDay(new Date());
    const toDayStr = toIso?.trim() || todayKuwait;
    const fromDayStr =
      fromIso?.trim() || addKuwaitCalendarDays(todayKuwait, -29);

    if (fromDayStr > toDayStr) {
      throw new BadRequestException('`from` must be on or before `to`');
    }

    const fromBound = parseKuwaitCalendarDateStart(fromDayStr);
    const windowEnd = new Date(
      parseKuwaitCalendarDateStart(toDayStr).getTime() + 86400000,
    );

    const rows = await this.prisma.transactionHistory.findMany({
      where: {
        createdAt: { gte: fromBound, lt: windowEnd },
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
      let d = fromDayStr;
      d <= toDayStr;
      d = addKuwaitCalendarDays(d, 1)
    ) {
      const key = d;
      buckets.set(key, {
        dayIso: key,
        recoveredKd: '0.0000',
        recoveredCashKd: '0.0000',
        recoveredElectronicKd: '0.0000',
        recoveredWalletKd: '0.0000',
        settlementCount: 0,
        subscriptionCount: 0,
        trendRatio: 0,
      });
    }

    let total = new Prisma.Decimal(0);
    let totalCash = new Prisma.Decimal(0);
    let totalElectronic = new Prisma.Decimal(0);
    let totalWallet = new Prisma.Decimal(0);
    for (const r of rows) {
      const key = toKuwaitIsoDay(r.createdAt);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      const debtSettled = extractDebtSettled(r.metadata);
      if (debtSettled.lte(0)) {
        if (r.type === LedgerTransactionType.ORDER_WALLET_SETTLEMENT) {
          bucket.settlementCount += 1;
        } else {
          bucket.subscriptionCount += 1;
        }
        continue;
      }

      total = total.plus(debtSettled);
      bucket.recoveredKd = FOUR_DP(
        new Prisma.Decimal(bucket.recoveredKd).plus(debtSettled),
      );

      // V19.11.3 — split recovery by settlement channel so the KNET
      // stream is visible and never mistaken for driver cash.
      //   • SUBSCRIPTION_ACTIVATION → wallet (book-entry; subscription
      //     plan absorbed the legacy debt, no fresh money changed hands).
      //   • ORDER_WALLET_SETTLEMENT with confirmedPaymentMethod / posPaymentMethod
      //     ∈ {KNET, PAYMENT_LINK, ONLINE} → electronic.
      //   • Everything else (CASH, DEBT_ON_ACCOUNT) → cash stream.
      let channel: 'cash' | 'electronic' | 'wallet';
      if (r.type === LedgerTransactionType.SUBSCRIPTION_ACTIVATION) {
        channel = 'wallet';
      } else {
        const rawMethod =
          readMetaString(r.metadata, 'confirmedPaymentMethod') ??
          readMetaString(r.metadata, 'posPaymentMethod') ??
          readMetaString(r.metadata, 'paymentMethod');
        if (
          rawMethod === PosPaymentMethod.KNET ||
          rawMethod === PosPaymentMethod.PAYMENT_LINK ||
          rawMethod === PosPaymentMethod.ONLINE
        ) {
          channel = 'electronic';
        } else {
          channel = 'cash';
        }
      }

      if (channel === 'cash') {
        totalCash = totalCash.plus(debtSettled);
        bucket.recoveredCashKd = FOUR_DP(
          new Prisma.Decimal(bucket.recoveredCashKd).plus(debtSettled),
        );
      } else if (channel === 'electronic') {
        totalElectronic = totalElectronic.plus(debtSettled);
        bucket.recoveredElectronicKd = FOUR_DP(
          new Prisma.Decimal(bucket.recoveredElectronicKd).plus(debtSettled),
        );
      } else {
        totalWallet = totalWallet.plus(debtSettled);
        bucket.recoveredWalletKd = FOUR_DP(
          new Prisma.Decimal(bucket.recoveredWalletKd).plus(debtSettled),
        );
      }

      if (r.type === LedgerTransactionType.ORDER_WALLET_SETTLEMENT) {
        bucket.settlementCount += 1;
      } else {
        bucket.subscriptionCount += 1;
      }
    }

    const days = Array.from(buckets.values());
    const summary = computeCanonicalDebtRecoverySummary(days);
    days.forEach((day, index) => {
      day.trendRatio = summary.trendRatios[index] ?? 0;
    });

    return {
      from: fromDayStr,
      to: toDayStr,
      totalRecoveredKd: FOUR_DP(total),
      totalRecoveredCashKd: FOUR_DP(totalCash),
      totalRecoveredElectronicKd: FOUR_DP(totalElectronic),
      totalRecoveredWalletKd: FOUR_DP(totalWallet),
      totalSettlements: summary.totalSettlements,
      totalSubscriptions: summary.totalSubscriptions,
      maxRecoveredKd: summary.maxRecoveredKd,
      days,
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
    const result = await this.customerLedger.recordPartialDebtPayment({
      customerId,
      amountKd: dto.amountKd,
      discountKd: dto.discountKd,
      paymentMethod: method,
      performedByUserId,
      note: dto.note,
    });
    try {
      const cust = await this.prisma.customer.findUnique({
        where: { id: customerId },
        select: { phone: true, phone2: true },
      });
      const phone = cust
        ? resolveCustomerPhoneForNotify(cust.phone, cust.phone2)
        : '';
      if (!phone.trim()) {
        return result;
      }
      this.customerNotifications.notifyStandaloneDebtReceipt({
        customerPhone: phone,
        transactionHistoryId: result.transactionHistoryId,
        amountCollectedKd: result.amountCollectedKd,
        remainingDebtKd: result.newDebtKd,
      });
    } catch {
      /* best-effort — never block debt collection */
    }
    return result;
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

    const orderIds = invoices.map((o) => o.id);
    const [fbAgg, fbLatest, fbRows] = await Promise.all([
      this.prisma.orderFeedback.aggregate({
        where: { order: { customerId } },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      this.prisma.orderFeedback.findFirst({
        where: { order: { customerId } },
        orderBy: { submittedAt: 'desc' },
        select: {
          rating: true,
          note: true,
          submittedAt: true,
          orderId: true,
          order: {
            select: { serialNumber: true, invoiceNumber: true },
          },
        },
      }),
      orderIds.length > 0
        ? this.prisma.orderFeedback.findMany({
            where: { orderId: { in: orderIds } },
            select: { orderId: true, rating: true, submittedAt: true },
          })
        : Promise.resolve(
            [] as Array<{
              orderId: string;
              rating: number;
              submittedAt: Date;
            }>,
          ),
    ]);
    const feedbackByOrderId = new Map(
      fbRows.map((r) => [r.orderId, r] as const),
    );
    const ratingAvg = fbAgg._avg.rating;
    const feedbackSummary = {
      averageRating:
        ratingAvg != null ? Math.round(Number(ratingAvg) * 100) / 100 : null,
      ratedCount: fbAgg._count._all,
      lastFeedback:
        fbLatest ?
          {
            rating: fbLatest.rating,
            note: fbLatest.note,
            submittedAtIso: fbLatest.submittedAt.toISOString(),
            orderId: fbLatest.orderId,
            orderSerial:
              fbLatest.order?.serialNumber?.trim() ||
              fbLatest.order?.invoiceNumber?.trim() ||
              null,
          }
        : null,
    };

    // V19.8.3 — batch-fetch every invoice the activation rows auto-closed
    // so the customer statement can spell out "these old invoices were
    // paid from your new subscription credit". We union all
    // `autoClosedInvoiceIds` across activation events into a single
    // query instead of N+1-ing per row.
    const allClosedIds = Array.from(
      new Set(
        events.flatMap((e) =>
          e.type === LedgerTransactionType.SUBSCRIPTION_ACTIVATION
            ? readMetaStringArray(e.metadata, 'autoClosedInvoiceIds')
            : [],
        ),
      ),
    );
    const closedOrdersById = new Map<
      string,
      { id: string; serial: string | null; totalKd: string; createdAtIso: string }
    >();
    if (allClosedIds.length > 0) {
      const closedOrders = await this.prisma.order.findMany({
        where: { id: { in: allClosedIds } },
        select: {
          id: true,
          serialNumber: true,
          invoiceNumber: true,
          totalPrice: true,
          createdAt: true,
        },
      });
      for (const o of closedOrders) {
        closedOrdersById.set(o.id, {
          id: o.id,
          serial: o.serialNumber ?? o.invoiceNumber ?? null,
          totalKd: FOUR_DP(o.totalPrice),
          createdAtIso: o.createdAt.toISOString(),
        });
      }
    }

    const [collectionsDebtBasis, visibleDebt] = await Promise.all([
      this.orders.getOperationalDebtKdBreakdown(
        customerId,
        customer.wallet?.debt,
      ),
      this.debtVisibility.getCustomerVisibleDebt(customerId),
    ]);

    const mappedEvents: CustomerLedgerEventDto[] = events.map((e) => {
      const rawMethod =
        readMetaString(e.metadata, 'posPaymentMethod') ??
        readMetaString(e.metadata, 'paymentMethod') ??
        e.order?.posPaymentMethod ??
        null;
      const paymentMethod =
        rawMethod && (Object.values(PosPaymentMethod) as string[]).includes(rawMethod)
          ? (rawMethod as PosPaymentMethod)
          : null;

      let kind: CustomerLedgerEventKind;
      if (e.type === LedgerTransactionType.SUBSCRIPTION_ACTIVATION) {
        kind = 'SUBSCRIPTION_ACTIVATION';
      } else if (
        e.type === LedgerTransactionType.SUBSCRIPTION_CANCELLATION
      ) {
        kind = 'SUBSCRIPTION_CANCELLATION';
      } else if (isPartialDebtPaymentRow(e.metadata)) {
        kind = 'PARTIAL_DEBT_PAYMENT';
      } else if (e.orderId) {
        kind = classifyOrderWalletLedgerKind(e.metadata, paymentMethod);
      } else {
        // Fallback for legacy rows with ORDER_WALLET_SETTLEMENT type but
        // no orderId — treat as a generic carry/rollover for display.
        kind = 'SUBSCRIPTION_ROLLOVER_CARRY';
      }

      const debtSettled = extractDebtSettled(e.metadata);
      const debtDiscount = extractDebtDiscount(e.metadata);

      // V19.8.3 — activation-only enrichment. `activationBreakdown`
      // surfaces each leg of the money flow (what the customer paid,
      // what the branch subsidized, what went to debt, what is
      // usable credit). `closedInvoices` lists the old receivables
      // that got retired by the FIFO auto-closure from V19.7.4.
      let activationBreakdown:
        | {
            totalCollectedKd: string;
            actualBalanceKd: string;
            subsidyKd: string;
            debtSettledKd: string;
            creditedToBalanceKd: string;
            carriedBalanceKd: string;
          }
        | null = null;
      let closedInvoicesForEvent: Array<{
        id: string;
        serial: string | null;
        totalKd: string;
        createdAtIso: string;
      }> = [];
      if (kind === 'SUBSCRIPTION_ACTIVATION') {
        activationBreakdown = {
          totalCollectedKd: FOUR_DP(
            new Prisma.Decimal(
              readMetaString(e.metadata, 'totalCollected') ?? '0',
            ),
          ),
          actualBalanceKd: FOUR_DP(
            new Prisma.Decimal(
              readMetaString(e.metadata, 'actualBalance') ?? '0',
            ),
          ),
          subsidyKd: FOUR_DP(
            new Prisma.Decimal(readMetaString(e.metadata, 'subsidy') ?? '0'),
          ),
          debtSettledKd: FOUR_DP(debtSettled),
          creditedToBalanceKd: FOUR_DP(
            new Prisma.Decimal(
              readMetaString(e.metadata, 'creditedToBalance') ?? '0',
            ),
          ),
          carriedBalanceKd: FOUR_DP(
            new Prisma.Decimal(
              readMetaString(e.metadata, 'carriedBalanceKd') ?? '0',
            ),
          ),
        };
        const ids = readMetaStringArray(e.metadata, 'autoClosedInvoiceIds');
        closedInvoicesForEvent = ids
          .map((id) => closedOrdersById.get(id))
          .filter(
            (
              o,
            ): o is {
              id: string;
              serial: string | null;
              totalKd: string;
              createdAtIso: string;
            } => !!o,
          );
      }

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
        activationBreakdown,
        closedInvoices: closedInvoicesForEvent,
        projection: computeCanonicalStatementEventProjection({
          kind,
          amountKd: e.amount,
          balanceAfterKd: e.balanceAfter,
          debtAfterKd: e.debtAfter,
          debtSettledKd: debtSettled,
          debtDiscountKd: debtDiscount,
          closedInvoices: closedInvoicesForEvent,
        }),
      };
    });

    const mappedInvoices: CustomerLedgerInvoiceDto[] = invoices.map((o) => {
      const openDebt = collectionsDebtBasis.collectionsOpenOrderIds.has(o.id);
      const fr = feedbackByOrderId.get(o.id);
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
        projectionGroup: canonicalStatementInvoiceGroup({
          status: o.status,
          openDebt,
        }),
        feedbackRating: fr?.rating ?? null,
        feedbackSubmittedAtIso: fr?.submittedAt.toISOString() ?? null,
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
    const statementInvoiceTotals =
      computeCanonicalStatementTotals(mappedInvoices);
    // Statement invoices are historical/details; the header debt sent to UI/WhatsApp
    // must be the current banking-core AR value used by Collections/Outstanding.
    const statementRemainingDebtKd = new Prisma.Decimal(
      visibleDebt.remainingDebtKd,
    );

    const customerHeader = {
      id: customer.id,
      displayName: customer.displayName ?? null,
      phone: customer.phone ?? null,
      phone2: customer.phone2 ?? null,
      originBranchId: customer.originBranchId ?? null,
      originBranchName: customer.originBranch?.name ?? null,
      walletBalanceKd: FOUR_DP(
        customer.wallet?.balance ?? new Prisma.Decimal(0),
      ),
      walletDebtKd: FOUR_DP(collectionsDebtBasis.walletDebtKd),
      collectionsReceivableKd: FOUR_DP(
        collectionsDebtBasis.collectionsReceivableKd,
      ),
      remainingDebtKd: FOUR_DP(statementRemainingDebtKd),
      operationalDebtKd: FOUR_DP(collectionsDebtBasis.operationalDebtKd),
    };

    const activeSubscription =
      latestSub && latestSub.status === CustomerSubscriptionStatus.ACTIVE
        ? {
            id: latestSub.id,
            status: latestSub.status,
            planNameSnapshot: latestSub.planNameSnapshot,
            planSalePriceKd: FOUR_DP(latestSub.planSalePriceSnapshot),
            planActualBalanceKd: FOUR_DP(latestSub.planActualBalanceSnapshot),
            planValidityDays: latestSub.planValidityDaysSnapshot,
            carriedBalanceKd: FOUR_DP(latestSub.carriedBalanceKd),
            parentSubscriptionId: latestSub.parentSubscriptionId,
            activatedAtIso: latestSub.activatedAt.toISOString(),
            expiresAtIso: latestSub.expiresAt.toISOString(),
            closedAtIso: latestSub.closedAt?.toISOString() ?? null,
            closedReason: latestSub.closedReason ?? null,
          }
        : null;

    const totals = {
      eventCount: mappedEvents.length,
      invoiceCount: mappedInvoices.length,
      openInvoiceCount,
      totalInvoicedKd: statementInvoiceTotals.totalInvoicedKd,
      totalPaidInvoicesKd: statementInvoiceTotals.totalPaidInvoicesKd,
      totalOpenInvoicesKd: statementInvoiceTotals.totalOpenInvoicesKd,
      unpaidInvoiceCount: statementInvoiceTotals.unpaidInvoiceCount,
      paidInvoiceCount: statementInvoiceTotals.paidInvoiceCount,
      canceledInvoiceCount: statementInvoiceTotals.canceledInvoiceCount,
      totalCollectedKd: FOUR_DP(totalCollected),
      totalDiscountedKd: FOUR_DP(totalDiscounted),
    };

    // V21 Phase 3 — derive an audit-grade snapshot envelope over the
    // canonical statement payload (customer header, subscription,
    // invoices, events, totals, feedback). Hash is deterministic so two
    // identical statements always produce the same envelope.
    const sortedEvents = [...mappedEvents].sort((a, b) => {
      const at = a.atIso.localeCompare(b.atIso);
      return at !== 0 ? at : a.id.localeCompare(b.id);
    });
    const sortedInvoices = [...mappedInvoices].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    const snapshotEnvelope = buildCanonicalSnapshot({
      payload: {
        customer: customerHeader,
        activeSubscription,
        isCutOff: latestSub?.status === CustomerSubscriptionStatus.CUT_OFF,
        fromIso,
        toIso,
        events: sortedEvents,
        invoices: sortedInvoices,
        totals,
      },
      sourceEventIds: mappedEvents.map((e) => e.id),
      sourceInvoiceIds: mappedInvoices.map((i) => i.id),
      snapshotVersion: CANONICAL_SNAPSHOT_VERSION,
    });

    return {
      customer: customerHeader,
      activeSubscription,
      isCutOff: latestSub?.status === CustomerSubscriptionStatus.CUT_OFF,
      fromIso,
      toIso,
      events: mappedEvents,
      invoices: mappedInvoices,
      totals,
      feedbackSummary,
      snapshot: {
        snapshotVersion: snapshotEnvelope.snapshotVersion,
        generatedAtIso: snapshotEnvelope.generatedAtIso,
        canonicalHash: snapshotEnvelope.canonicalHash,
        sourceEventIds: snapshotEnvelope.sourceEventIds,
        sourceInvoiceIds: snapshotEnvelope.sourceInvoiceIds,
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
      const viaLinkCategory =
        reportingCategory === 'DEBT_COLLECTION_VIA_LINK';
      if (!viaLink && !manual && !viaLinkCategory) continue;
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
   * `CustomerLedgerService.activateSubscriptionPlan` flow AND to
   * `OrdersService.getOperationalDebtKdBreakdown` / the subscribers list totals;
   * otherwise the preview and the committed result will disagree and the agent
   * will lose trust. That's why we re-derive from the same inputs:
   *   effectiveDebt = wallet.debt + Σ(UNPAID, unsettled order totals)
   *   debtToSettle = min(effectiveDebt, planActualBalance)
   *   creditedToBalance = max(0, planActualBalance − debtToSettle)
   *   newBalance = currentBalance + creditedToBalance
   *   newWalletDebt = wallet.debt − min(wallet.debt, debtToSettle)
   *   subsidy = max(0, planActualBalance − planSalePrice)
   * No persistence, no transaction — pure read.
   */
  async getDebtConversionOptions(
    customerId: string,
    /** When set, cashRequired / remainingDebt mirror `{@link CustomerLedgerService.activateSubscriptionPlan}` for that settlement mode. */
    paymentMethodHint?: PosPaymentMethod,
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

    const debtBreakdown = await this.orders.getOperationalDebtKdBreakdown(
      customerId,
      customer.wallet?.debt,
    );
    const walletDebt = debtBreakdown.walletDebtKd;
    const implicitDebt = debtBreakdown.collectionsReceivableKd;
    const operationalCurrentDebt = debtBreakdown.operationalDebtKd;
    const zero = new Prisma.Decimal(0);

    const options: DebtConversionPlanOptionDto[] = plans.map((p) => {
      // V19.7.3 — mirror `activateSubscriptionPlan`: the CREDIT amount
      // (`actualBalance`), not the sale price, is what offsets
      // existing debt. V19.12.1 — debt basis includes unposted UNPAID
      // invoices (payment-link pending). All arithmetic on Prisma.Decimal.
      const debtToSettle = operationalCurrentDebt.lt(p.actualBalance)
        ? operationalCurrentDebt
        : p.actualBalance;
      const ledgerPaid = walletDebt.lt(debtToSettle) ? walletDebt : debtToSettle;
      const implicitPaid = debtToSettle.minus(ledgerPaid);
      const remainingLedger = walletDebt.minus(ledgerPaid);
      const remainingImplicit = implicitDebt.minus(implicitPaid);
      const remainingTotal = remainingLedger.plus(remainingImplicit);

      /** Matches `activateSubscriptionPlan`: sale price accrued when `DEBT_ON_ACCOUNT`. */
      const pm = paymentMethodHint ?? PosPaymentMethod.CASH;
      const accrualOnAccount =
        pm === PosPaymentMethod.DEBT_ON_ACCOUNT && p.salePrice.gt(0)
          ? p.salePrice
          : zero;
      const displayedRemainingDebt = remainingTotal.plus(accrualOnAccount);

      const rawCredit = p.actualBalance.minus(debtToSettle);
      const creditedToBalance = rawCredit.gt(0) ? rawCredit : zero;
      const projectedBalance = currentBalance.plus(creditedToBalance);
      const subsidy = p.actualBalance.gt(p.salePrice)
        ? p.actualBalance.minus(p.salePrice)
        : zero;

      const convertsDebt = debtToSettle.gt(0);
      const clearsAllDebt =
        operationalCurrentDebt.gt(0) && displayedRemainingDebt.lte(0);
      const recommended =
        operationalCurrentDebt.gt(0) &&
        p.actualBalance.gte(operationalCurrentDebt);

      const cashRequired =
        pm === PosPaymentMethod.DEBT_ON_ACCOUNT ? zero : p.salePrice;

      const projectedLedgerDebtDisplay = remainingLedger.plus(accrualOnAccount);

      return {
        planId: p.id,
        planName: p.name,
        planValidityDays: p.validityDays,
        cashRequiredKd: FOUR_DP(cashRequired),
        planActualBalanceKd: FOUR_DP(p.actualBalance),
        debtToSettleKd: FOUR_DP(debtToSettle),
        remainingDebtKd: FOUR_DP(displayedRemainingDebt),
        creditedToBalanceKd: FOUR_DP(creditedToBalance),
        projectedWalletBalanceKd: FOUR_DP(projectedBalance),
        projectedWalletDebtKd: FOUR_DP(projectedLedgerDebtDisplay),
        subsidyKd: FOUR_DP(subsidy),
        convertsDebt,
        clearsAllDebt,
        recommended,
      };
    });

    return {
      customerId: customer.id,
      currentDebtKd: FOUR_DP(operationalCurrentDebt),
      currentBalanceKd: FOUR_DP(currentBalance),
      hasDebt: operationalCurrentDebt.gt(0),
      ...(debtBreakdown.trace ?
        { debtKdBreakdownTrace: debtBreakdown.trace }
      : {}),
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
