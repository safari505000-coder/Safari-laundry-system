import { Injectable } from '@nestjs/common';
import { CashStatus, LedgerTransactionType, OrderStatus, Prisma } from '@prisma/client';
import { OrdersService } from '../orders/orders.service';
import type { DebtKdBreakdownTrace } from '../orders/debt-kd-breakdown.util';
import { PrismaService } from '../prisma/prisma.service';

type ActivationMeta = {
  planId?: string;
  planName?: string;
};

export type SubscriberListRow = {
  customerId: string;
  customerName: string;
  /** E.164-ish compact phone (for WhatsApp/SMS deep-links). Optional. */
  customerPhone: string | null;
  subscriptionType: string;
  /** Plan ID used for renewal; null when we don't know the plan. */
  planId: string | null;
  startDate: string | null;
  expiryDate: string | null;
  remainingDays: number | null;
  balance: string;
  /**
   * Signed net wallet position vs operational debt: `wallet.balance −
   * operationalDebtKd`. Positive = prepaid ahead of owed amount; negative = owes
   * more than credit on the wallet.
   */
  balanceDisplayKd: string;
  /**
   * V19.4 — CC pack #1. **Wallet ledger debt** (`CustomerWallet.debt` only).
   * Partial debt payment caps against this field — it does NOT include
   * UNPAID invoices that have not yet run wallet settlement (payment-link
   * pipeline). For the operational owed figure see `operationalDebtKd`.
   */
  debt: string;
  /**
   * Portion of `operationalDebtKd` **not** covered by `CustomerWallet.debt`
   * (`max(operational − wallet.debt, 0)`), matching the conversion modal split;
   * no longer a separate collections-only filtered slice.
   */
  unsettledUnpaidKd: string;
  /**
   * Operational debt: **max**(صافي أستاذ الديون، مجموع المحفظة الرسمية،
   * محفظة+تحصيل قائمة الفواتير).
   * This is NOT the canonical Customer 360 financial number.
   */
  operationalDebtKd: string;
  /** @deprecated Use operationalDebtKd. Kept for client compatibility. */
  effectiveDebtKd: string;
  rowStatus: 'active_ok' | 'active_warn' | 'expired' | 'open_credit';
  /**
   * Dastur §5 (V1.5) — days elapsed since the last activation (a.k.a.
   * "invoice age"). Null when no activation date is known.
   */
  invoiceAgeDays: number | null;
  /** Cumulative 24h-guarded reminders sent for this subscriber's wallet. */
  reminderCount: number;
  lastReminderAtIso: string | null;
  /**
   * true when no reminder has been sent OR the previous reminder is older
   * than 24h. Mirrors the backend guard on `/reminder` so the UI can
   * disable the button when it would be a no-op.
   */
  canRemindNow: boolean;
  /**
   * Σ `Order.reminderCount` across UNPAID invoices (each Collections WA link send +1).
   */
  collectionPaymentLinkReminderTotal: number;
  /** Days since oldest unpaid row with a minted hosted URL; null if none. */
  collectionPendingHostedLinkAgeDays: number | null;
  /**
   * فقط إذا كان السيرفر يعمل بـ `EXPOSE_DEBT_BREAKDOWN=1`: القيم الثلاث
   * المقارَنة + من فاز بـ `operationalDebtKd` (للتشخيص محلياً).
   */
  debtKdBreakdownTrace?: DebtKdBreakdownTrace;
};

function utcDayNumber(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function calendarDaysRemaining(expiry: Date): number {
  return Math.round((utcDayNumber(expiry) - utcDayNumber(new Date())) / 86400000);
}

function daysElapsedSince(from: Date): number {
  return Math.max(
    0,
    Math.round((utcDayNumber(new Date()) - utcDayNumber(from)) / 86400000),
  );
}

const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Dastur V1.5.3 — defensive guard for legacy rows where `subscriptionPlanName`
 * (or the activation metadata `planName`) was accidentally populated with the
 * plan's UUID instead of its human-readable name. If the string matches the
 * UUID shape exactly we treat it as a missing name and let the caller fall
 * back to the plan catalog lookup.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function looksLikeUuid(v: string | null | undefined): boolean {
  return typeof v === 'string' && UUID_RE.test(v.trim());
}

function addUtcDays(from: Date, days: number): Date {
  const out = new Date(from.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

@Injectable()
export class SubscribersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  /**
   * V19.4 — `q` is an optional needle (phone or display name). When
   * supplied we AND-combine it with the existing "has a subscription
   * anywhere" filter so the CC agent gets a narrow list without
   * breaking the legacy "show all subscribers" call (no arg).
   *
   * We match the needle three ways inside Postgres `ILIKE`:
   *   • displayName    contains needle (case-insensitive)
   *   • phone          contains needle
   *   • phone (digits) contains needle's digit-only variant — handled
   *                    in JS after the fetch because Prisma doesn't
   *                    ship a server-side regex-replace. Cheap because
   *                    the ILIKE filter already collapses the result set.
   */
  async list(q?: string): Promise<SubscriberListRow[]> {
    const needle = q?.trim() ?? '';
    const hasNeedle = needle.length > 0;
    const digits = hasNeedle ? needle.replace(/\D+/g, '') : '';

    const subscriptionWhere: {
      OR: Array<Record<string, unknown>>;
    } = {
      OR: [
        {
          transactionHistory: {
            some: { type: LedgerTransactionType.SUBSCRIPTION_ACTIVATION },
          },
        },
        { wallet: { subscriptionActivatedAt: { not: null } } },
        { wallet: { subscriptionExpiresAt: { not: null } } },
      ],
    };

    const where =
      hasNeedle ?
        {
          AND: [
            subscriptionWhere,
            {
              OR: [
                { displayName: { contains: needle, mode: 'insensitive' as const } },
                { phone: { contains: needle, mode: 'insensitive' as const } },
                ...(digits.length > 0
                  ? [{ phone: { contains: digits } }]
                  : []),
              ],
            },
          ],
        }
      : subscriptionWhere;

    const customers = await this.prisma.customer.findMany({
      where,
      select: {
        id: true,
        phone: true,
        displayName: true,
        wallet: true,
        transactionHistory: {
          where: { type: LedgerTransactionType.SUBSCRIPTION_ACTIVATION },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true, metadata: true },
        },
      },
    });

    const customerIds = customers.map((c) => c.id);
    const customerById = new Map(customers.map((c) => [c.id, c]));
    const debtBreakdownByCustomer =
      customerIds.length === 0 ?
        new Map<
          string,
                  Awaited<ReturnType<OrdersService['getOperationalDebtKdBreakdown']>>
        >()
      : new Map(
          await Promise.all(
            customerIds.map(
              async (
                id,
              ): Promise<
                [
                  string,
                  Awaited<
                    ReturnType<OrdersService['getOperationalDebtKdBreakdown']>
                  >,
                ]
              > => {
                const cust = customerById.get(id);
                const b = await this.orders.getOperationalDebtKdBreakdown(
                  id,
                  cust?.wallet?.debt,
                );
                return [id, b];
              },
            ),
          ),
        );

    const collectionLinkStats =
      customerIds.length === 0 ?
        new Map<string, { sumRem: number; minHostedLinkCreated: Date | null }>()
      : await (async (): Promise<
        Map<string, { sumRem: number; minHostedLinkCreated: Date | null }>
      > => {
        const stallRows = await this.prisma.order.findMany({
          where: {
            customerId: { in: customerIds },
            status: { not: OrderStatus.CANCELED },
            cashStatus: CashStatus.UNPAID,
          },
          select: {
            customerId: true,
            reminderCount: true,
            createdAt: true,
            posHostedPaymentUrl: true,
          },
        });
        const map = new Map<
          string,
          { sumRem: number; minHostedLinkCreated: Date | null }
        >();
        for (const id of customerIds) {
          map.set(id, { sumRem: 0, minHostedLinkCreated: null });
        }
        for (const o of stallRows) {
          const agg = map.get(o.customerId);
          if (!agg) continue;
          agg.sumRem += o.reminderCount ?? 0;
          if (o.posHostedPaymentUrl) {
            const cur = agg.minHostedLinkCreated;
            if (!cur || o.createdAt < cur) agg.minHostedLinkCreated = o.createdAt;
          }
        }
        return map;
      })();

    const now = Date.now();

    const planIds = new Set<string>();
    for (const c of customers) {
      const meta = c.transactionHistory[0]?.metadata as ActivationMeta | null;
      if (meta?.planId) {
        planIds.add(meta.planId);
      }
      // V1.5.3 — also load the wallet's current plan so we can resolve the
      // plan name even when the history doesn't have it (e.g. the wallet
      // was activated via a code path that didn't stamp metadata.planId).
      if (c.wallet?.subscriptionPlanId) {
        planIds.add(c.wallet.subscriptionPlanId);
      }
    }

    const plans =
      planIds.size > 0 ?
        await this.prisma.subscriptionPlan.findMany({
          where: { id: { in: [...planIds] } },
          select: { id: true, validityDays: true, name: true },
        })
      : [];
    const planMap = new Map(plans.map((p) => [p.id, p]));

    const rows: SubscriberListRow[] = [];

    for (const c of customers) {
      const w = c.wallet;
      const balanceStr = w?.balance.toString() ?? '0.0000';
      const balanceNum = Number.parseFloat(balanceStr);

      let startDate: Date | null = w?.subscriptionActivatedAt ?? null;
      let expiryDate: Date | null = w?.subscriptionExpiresAt ?? null;
      const rawWalletName = w?.subscriptionPlanName ?? null;
      const rawMetaName =
        (c.transactionHistory[0]?.metadata as ActivationMeta | undefined)
          ?.planName ?? null;
      // V1.5.3 — ignore UUID-shaped "names" from legacy data so the UI never
      // shows raw plan ids. Falls through to the plan catalog lookup below.
      let subscriptionType: string | null =
        (rawWalletName && !looksLikeUuid(rawWalletName) && rawWalletName) ||
        (rawMetaName && !looksLikeUuid(rawMetaName) && rawMetaName) ||
        null;

      const lastAct = c.transactionHistory[0];
      if ((!expiryDate || !startDate || !subscriptionType) && lastAct) {
        const meta = lastAct.metadata as ActivationMeta | null;
        const plan = meta?.planId ? planMap.get(meta.planId) : undefined;
        const vd =
          plan && plan.validityDays > 0 ? plan.validityDays : 30;
        if (!startDate) {
          startDate = lastAct.createdAt;
        }
        if (!expiryDate && startDate) {
          expiryDate = addUtcDays(startDate, vd);
        }
        if (!subscriptionType) {
          const metaName =
            meta?.planName && !looksLikeUuid(meta.planName)
              ? meta.planName
              : null;
          subscriptionType = metaName ?? plan?.name ?? null;
        }
      }

      // Last resort: if we still have nothing readable but we do have a
      // planId + plan catalog hit, use the catalog name. This catches the
      // case where the wallet row's `subscriptionPlanName` was never backfilled.
      if (!subscriptionType && w?.subscriptionPlanId) {
        const plan = planMap.get(w.subscriptionPlanId);
        if (plan?.name) subscriptionType = plan.name;
      }

      const customerName =
        [c.displayName, c.phone].find(
          (s): s is string => typeof s === 'string' && s.trim().length > 0,
        ) ?? c.id;

      const remainingDays =
        expiryDate ? calendarDaysRemaining(expiryDate) : null;

      let rowStatus: SubscriberListRow['rowStatus'];
      if (remainingDays !== null) {
        if (remainingDays < 0) {
          rowStatus = 'expired';
        } else if (remainingDays < 5) {
          rowStatus = 'active_warn';
        } else {
          rowStatus = 'active_ok';
        }
      } else if (Number.isFinite(balanceNum) && balanceNum > 0) {
        rowStatus = 'open_credit';
      } else {
        rowStatus = 'expired';
      }

      const activationDate =
        startDate ?? c.transactionHistory[0]?.createdAt ?? null;
      const invoiceAgeDays = activationDate ? daysElapsedSince(activationDate) : null;

      // Dastur §5 (V1.5) — resolve the plan id so the frontend can renew
      // straight away without a second round-trip.
      let planId: string | null = w?.subscriptionPlanId ?? null;
      if (!planId) {
        const metaPlanId = (c.transactionHistory[0]?.metadata as ActivationMeta | null)
          ?.planId;
        if (typeof metaPlanId === 'string' && metaPlanId.length > 0) {
          planId = metaPlanId;
        }
      }

      const lastReminderAt = w?.subscriptionLastReminderAt ?? null;
      const reminderCount = w?.subscriptionReminderCount ?? 0;
      const canRemindNow =
        !lastReminderAt || now - lastReminderAt.getTime() >= REMINDER_COOLDOWN_MS;

      const bd = debtBreakdownByCustomer.get(c.id)!;
      const openReceivable = bd.collectionsReceivableKd;
      const debtD = bd.walletDebtKd;
      const totalOwedD = bd.operationalDebtKd;
      const balanceD = w?.balance ?? new Prisma.Decimal(0);
      const balanceDisplayKd = balanceD.minus(totalOwedD).toFixed(4);

      const collectionLink = collectionLinkStats.get(c.id)!;
      const collectionPendingHostedLinkAgeDays =
        collectionLink.minHostedLinkCreated === null ?
          null
        : Math.floor(
            (now - collectionLink.minHostedLinkCreated.getTime()) /
              (24 * 60 * 60 * 1000),
          );

      rows.push({
        customerId: c.id,
        customerName,
        customerPhone: c.phone ?? null,
        subscriptionType: subscriptionType ?? '—',
        planId,
        startDate: startDate?.toISOString() ?? null,
        expiryDate: expiryDate?.toISOString() ?? null,
        remainingDays,
        balance: balanceStr,
        balanceDisplayKd,
        debt: debtD.toFixed(4),
        unsettledUnpaidKd: openReceivable.toFixed(4),
        operationalDebtKd: totalOwedD.toFixed(4),
        effectiveDebtKd: totalOwedD.toFixed(4),
        rowStatus,
        invoiceAgeDays,
        reminderCount,
        lastReminderAtIso: lastReminderAt?.toISOString() ?? null,
        canRemindNow,
        collectionPaymentLinkReminderTotal: collectionLink.sumRem,
        collectionPendingHostedLinkAgeDays,
        ...(bd.trace ? { debtKdBreakdownTrace: bd.trace } : {}),
      });
    }

    rows.sort((a, b) => {
      const ar = a.remainingDays;
      const br = b.remainingDays;
      if (ar === null && br === null) {
        return a.customerName.localeCompare(b.customerName);
      }
      if (ar === null) {
        return 1;
      }
      if (br === null) {
        return -1;
      }
      if (ar !== br) {
        return ar - br;
      }
      return a.customerName.localeCompare(b.customerName);
    });

    return rows;
  }
}
