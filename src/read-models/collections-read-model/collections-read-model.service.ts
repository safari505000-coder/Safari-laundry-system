import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DebtVisibilityService } from '../../finance/debt-visibility/debt-visibility.service';

/**
 * V20.4 — Phase 2 / Phase 4 collections projection.
 *
 * Backs the Collections page and the red-KPI card. Reads
 * `FinancialSnapshot` ranked by `remainingDebtKd` so a
 * 50-row page is one indexed query — no `JournalLine`
 * aggregation, no per-customer recompute.
 */

export type CollectionsRow = {
  customerId: string;
  remainingDebtKd: string;
  paidTotalKd: string;
  unpaidInvoicesCount: number;
  partiallyPaidInvoicesCount: number;
  overdueInvoicesCount: number;
  hasActiveSubscription: boolean;
  lastPaymentAt: string | null;
};

export type CollectionsKpi = {
  totalRemainingDebtKd: string;
  customersWithDebt: number;
  partiallyPaidInvoices: number;
  unpaidInvoices: number;
  overdueInvoices: number;
  generatedAt: string;
};

const TOL = new Prisma.Decimal('0.001');

@Injectable()
export class CollectionsReadModel {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: DebtVisibilityService,
  ) {}

  async listCollections(opts: {
    limit?: number;
    cursor?: string | null;
  }): Promise<{
    rows: CollectionsRow[];
    nextCursor: string | null;
  }> {
    const limit = Math.max(1, Math.min(opts.limit ?? 50, 200));
    const rows = await this.prisma.financialSnapshot.findMany({
      where: { remainingDebtKd: { gt: TOL } },
      orderBy: [{ remainingDebtKd: 'desc' }, { customerId: 'asc' }],
      take: limit + 1,
      ...(opts.cursor
        ? { cursor: { customerId: opts.cursor }, skip: 1 }
        : {}),
      select: {
        customerId: true,
        remainingDebtKd: true,
        paidTotalKd: true,
        unpaidInvoicesCount: true,
        partiallyPaidInvoicesCount: true,
        overdueInvoicesCount: true,
        lastPaymentAt: true,
      },
    });
    const sliced = rows.slice(0, limit);
    const nextCursor =
      rows.length > limit ? sliced[sliced.length - 1].customerId : null;
    const customerIds = sliced.map((r) => r.customerId);
    const subscriptionMap = await this.prisma.customerSubscription
      .findMany({
        where: {
          customerId: { in: customerIds },
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
        },
        select: { customerId: true },
      })
      .then((rs) => new Set(rs.map((r) => r.customerId)));
    return {
      rows: sliced.map((r) => ({
        customerId: r.customerId,
        remainingDebtKd: r.remainingDebtKd.toFixed(4),
        paidTotalKd: r.paidTotalKd.toFixed(4),
        unpaidInvoicesCount: r.unpaidInvoicesCount,
        partiallyPaidInvoicesCount: r.partiallyPaidInvoicesCount,
        overdueInvoicesCount: r.overdueInvoicesCount,
        hasActiveSubscription: subscriptionMap.has(r.customerId),
        lastPaymentAt: r.lastPaymentAt?.toISOString() ?? null,
      })),
      nextCursor,
    };
  }

  async getKpi(): Promise<CollectionsKpi> {
    return this.visibility.getCollectionsSnapshot();
  }
}
