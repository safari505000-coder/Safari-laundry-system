import { Injectable } from '@nestjs/common';
import { LedgerTransactionType } from '@prisma/client';
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

function addUtcDays(from: Date, days: number): Date {
  const out = new Date(from.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

@Injectable()
export class SubscribersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<SubscriberListRow[]> {
    const customers = await this.prisma.customer.findMany({
      where: {
        OR: [
          {
            transactionHistory: {
              some: { type: LedgerTransactionType.SUBSCRIPTION_ACTIVATION },
            },
          },
          { wallet: { subscriptionActivatedAt: { not: null } } },
          { wallet: { subscriptionExpiresAt: { not: null } } },
        ],
      },
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

    const now = Date.now();

    const planIds = new Set<string>();
    for (const c of customers) {
      const meta = c.transactionHistory[0]?.metadata as ActivationMeta | null;
      if (meta?.planId) {
        planIds.add(meta.planId);
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
      let subscriptionType =
        w?.subscriptionPlanName ??
        ((c.transactionHistory[0]?.metadata as ActivationMeta | undefined)
          ?.planName ??
          null);

      const lastAct = c.transactionHistory[0];
      if ((!expiryDate || !startDate) && lastAct) {
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
          subscriptionType = meta?.planName ?? plan?.name ?? null;
        }
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
        rowStatus,
        invoiceAgeDays,
        reminderCount,
        lastReminderAtIso: lastReminderAt?.toISOString() ?? null,
        canRemindNow,
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
