import { Injectable } from '@nestjs/common';
import { DebtVisibilityService } from '../../finance/debt-visibility/debt-visibility.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * V20.4 — Phase 2 / Phase 16 subscriber read projection.
 *
 * Joins active-subscription state with the snapshot's
 * `remainingDebtKd` so the Subscribers list never reads
 * `wallet.debt` and never aggregates orders on the read path.
 *
 * Pure projection — the SubscribersService still owns its
 * `list()` method to preserve the existing query / search /
 * pagination contract; it now delegates to this read model
 * for the canonical debt enrichment (V20.3.2 inspector
 * verifies the equality post-deploy).
 */
export type SubscriberDebtEnrichment = {
  customerId: string;
  remainingDebtKd: string;
  hasDebt: boolean;
  hasActiveSubscription: boolean;
  fromSnapshot: boolean;
};

@Injectable()
export class SubscriberReadModel {
  constructor(
    private readonly visibility: DebtVisibilityService,
    private readonly prisma: PrismaService,
  ) {}

  async enrichBatch(customerIds: string[]): Promise<
    Map<string, SubscriberDebtEnrichment>
  > {
    const out = new Map<string, SubscriberDebtEnrichment>();
    if (customerIds.length === 0) return out;
    const [debts, activeSet] = await Promise.all([
      this.visibility.getCustomerVisibleDebtBatch(customerIds),
      this.prisma.customerSubscription
        .findMany({
          where: {
            customerId: { in: customerIds },
            status: 'ACTIVE',
            expiresAt: { gt: new Date() },
          },
          select: { customerId: true },
        })
        .then((rs) => new Set(rs.map((r) => r.customerId))),
    ]);
    for (const id of customerIds) {
      const d = debts.get(id);
      out.set(id, {
        customerId: id,
        remainingDebtKd: d?.remainingDebtKd ?? '0.0000',
        hasDebt: d?.hasDebt ?? false,
        hasActiveSubscription: activeSet.has(id),
        fromSnapshot: d?.fromSnapshot ?? false,
      });
    }
    return out;
  }
}
