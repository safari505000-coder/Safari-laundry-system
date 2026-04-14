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
  subscriptionType: string;
  startDate: string | null;
  expiryDate: string | null;
  remainingDays: number | null;
  balance: string;
  rowStatus: 'active_ok' | 'active_warn' | 'expired' | 'open_credit';
};

function utcDayNumber(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function calendarDaysRemaining(expiry: Date): number {
  return Math.round((utcDayNumber(expiry) - utcDayNumber(new Date())) / 86400000);
}

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

      rows.push({
        customerId: c.id,
        customerName,
        subscriptionType: subscriptionType ?? '—',
        startDate: startDate?.toISOString() ?? null,
        expiryDate: expiryDate?.toISOString() ?? null,
        remainingDays,
        balance: balanceStr,
        rowStatus,
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
