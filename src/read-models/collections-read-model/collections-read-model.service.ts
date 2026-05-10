import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DebtVisibilityService } from '../../finance/debt-visibility/debt-visibility.service';

/**
 * V20.4 — Phase 2 / Phase 4 collections projection.
 *
 * Backs the Collections page and the red-KPI card. The candidate
 * set and displayed money both come from Journal AR through the
 * visibility facade, so delayed snapshots cannot leave stale debt
 * on operator screens.
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
    const journalLines = await this.prisma.journalLine.findMany({
      where: { account: { code: '1300' } },
      select: {
        debit: true,
        credit: true,
        entry: { select: { customerId: true } },
      },
    });
    const byCustomer = new Map<string, Prisma.Decimal>();
    for (const line of journalLines) {
      const customerId = line.entry.customerId;
      if (!customerId) continue;
      const prev = byCustomer.get(customerId) ?? new Prisma.Decimal(0);
      byCustomer.set(customerId, prev.plus(line.debit).minus(line.credit));
    }
    const rankedCustomerIds = Array.from(byCustomer.entries())
      .filter(([, amount]) => amount.greaterThan(TOL))
      .sort((a, b) => {
        const debtCmp = b[1].cmp(a[1]);
        return debtCmp !== 0 ? debtCmp : a[0].localeCompare(b[0]);
      })
      .map(([customerId]) => customerId);
    const start =
      opts.cursor ? Math.max(0, rankedCustomerIds.indexOf(opts.cursor) + 1) : 0;
    const pageCustomerIds = rankedCustomerIds.slice(start, start + limit + 1);
    const slicedIds = pageCustomerIds.slice(0, limit);
    const nextCursor =
      pageCustomerIds.length > limit ? slicedIds[slicedIds.length - 1] : null;
    const subscriptionMap = await this.prisma.customerSubscription
      .findMany({
        where: {
          customerId: { in: slicedIds },
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
        },
        select: { customerId: true },
      })
      .then((rs) => new Set(rs.map((r) => r.customerId)));
    const visibleDebts = await this.visibility.getCustomerVisibleDebtBatch(slicedIds);
    return {
      rows: slicedIds
        .map((customerId) => visibleDebts.get(customerId))
        .filter((debt): debt is NonNullable<typeof debt> => debt != null)
        .filter((debt) => new Prisma.Decimal(debt.remainingDebtKd).greaterThan(TOL))
        .map((debt) => ({
          customerId: debt.customerId,
          remainingDebtKd: debt.remainingDebtKd,
          paidTotalKd: debt.paidTotalKd,
          unpaidInvoicesCount: debt.unpaidInvoicesCount,
          partiallyPaidInvoicesCount: debt.partiallyPaidInvoicesCount,
          overdueInvoicesCount: debt.overdueInvoicesCount,
          hasActiveSubscription: subscriptionMap.has(debt.customerId),
          lastPaymentAt: debt.lastPaymentAt,
        })),
      nextCursor,
    };
  }

  async getKpi(): Promise<CollectionsKpi> {
    return this.visibility.getCollectionsSnapshot();
  }
}
