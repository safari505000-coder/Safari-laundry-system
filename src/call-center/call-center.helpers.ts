import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PosPaymentMethod, Prisma, SafariRole } from '@prisma/client';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import type { ReminderResultDto } from './dto/reminder-result.dto';
import type { CustomerLedgerEventKind } from './dto/customer-ledger.dto';

/** Block call-center duplicate WA only inside the 2.5h cooldown when the field already notified. */
export function assertCallCenterMaySendCollectionPaymentWa(
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
export const ORDER_REMINDER_COOLDOWN_MS = 2.5 * 60 * 60 * 1000; // 9_000_000 ms
export const SUBSCRIBER_REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function buildReminderResult(args: {
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

export const FOUR_DP = (d: Prisma.Decimal): string => d.toFixed(4);
/**
 * V1.6.5 — KWD standard is 3 decimal places (fils). The Collections KPI
 * cards and the table both display 3dp, so the aggregates that feed
 * them must serialize with the same precision. Historic reports that
 * still expect 4dp (e.g. the Debt-Recovery report) keep using FOUR_DP.
 */
export const KWD_DP = (d: Prisma.Decimal): string => d.toFixed(3);

/** Parse YYYY-MM-DD into UTC midnight. Invalid strings throw. */
export function parseDayUtc(iso: string): Date {
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
export const KUWAIT_OFFSET_MS = 3 * 60 * 60 * 1000;

export function kuwaitDayBounds(now: Date): {
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
export function toKuwaitIsoDay(d: Date): string {
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
export function parseKuwaitCalendarDateStart(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) {
    throw new BadRequestException(`Invalid date: ${iso}`);
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return new Date(Date.UTC(y, mo - 1, d) - KUWAIT_OFFSET_MS);
}

export function addKuwaitCalendarDays(
  isoYmd: string,
  deltaDays: number,
): string {
  const start = parseKuwaitCalendarDateStart(isoYmd);
  return toKuwaitIsoDay(new Date(start.getTime() + deltaDays * 86400000));
}

/**
 * V1.6.1 — Orders don't carry `branchId` directly; the fulfilling branch
 * is the driver's branch for driver-led sales, falling back to the
 * customer's `originBranchId` for office-only invoices (e.g. a debt
 * paid online without a driver).
 */
export function orderBranchWhere(
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
 */
export function ledgerBranchWhere(
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
export function extractDebtSettled(
  meta: Prisma.JsonValue | null,
): Prisma.Decimal {
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
export function isDebtViaLinkRow(meta: Prisma.JsonValue | null): boolean {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return false;
  return (meta as Record<string, unknown>).debtSettlementViaLink === true;
}

export function isManualCallCenterCollectionRow(
  meta: Prisma.JsonValue | null,
): boolean {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return false;
  const m = meta as Record<string, unknown>;
  return (
    m.debtSettlementViaCallCenter === true || m.debtPaymentOnly === true
  );
}

export function isPartialDebtPaymentRow(meta: Prisma.JsonValue | null): boolean {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return false;
  return (meta as Record<string, unknown>).debtPaymentOnly === true;
}

/** Extract `debtDiscount` (CC #1 discount portion) from metadata. */
export function extractDebtDiscount(
  meta: Prisma.JsonValue | null,
): Prisma.Decimal {
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
export function readMetaString(
  meta: Prisma.JsonValue | null,
  key: string,
): string | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const v = (meta as Record<string, unknown>)[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function readMetaStringArray(
  meta: Prisma.JsonValue | null,
  key: string,
): string[] {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return [];
  const v = (meta as Record<string, unknown>)[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

export function parseMetaAppliedFromWallet(
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

export function classifyOrderWalletLedgerKind(
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

export function kuwaitDayFromIso(iso: string): {
  dayStart: Date;
  dayEnd: Date;
} {
  const base = parseDayUtc(iso);
  const dayStart = new Date(base.getTime() - KUWAIT_OFFSET_MS);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  return { dayStart, dayEnd };
}
