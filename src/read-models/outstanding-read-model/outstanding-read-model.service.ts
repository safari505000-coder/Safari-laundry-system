import { Injectable } from '@nestjs/common';
import { DebtVisibilityService } from '../../finance/debt-visibility/debt-visibility.service';

/**
 * V20.4 — Phase 2 / Phase 16 outstanding read projection.
 *
 * Wraps `DebtVisibilityService` so the Outstanding Payments
 * page consumes the canonical `remainingDebtKd` projection
 * exclusively. The existing `OutstandingService` keeps its
 * filtering / pagination contract; the per-row debt total
 * comes from this projection going forward.
 */
export type OutstandingDebtEnrichment = {
  customerId: string;
  remainingDebtKd: string;
  unpaidInvoicesCount: number;
  partiallyPaidInvoicesCount: number;
  overdueInvoicesCount: number;
  fromSnapshot: boolean;
};

@Injectable()
export class OutstandingReadModel {
  constructor(private readonly visibility: DebtVisibilityService) {}

  async enrichBatch(
    customerIds: string[],
  ): Promise<Map<string, OutstandingDebtEnrichment>> {
    const out = new Map<string, OutstandingDebtEnrichment>();
    if (customerIds.length === 0) return out;
    const debts = await this.visibility.getCustomerVisibleDebtBatch(customerIds);
    for (const [id, d] of debts) {
      out.set(id, {
        customerId: id,
        remainingDebtKd: d.remainingDebtKd,
        unpaidInvoicesCount: d.unpaidInvoicesCount,
        partiallyPaidInvoicesCount: d.partiallyPaidInvoicesCount,
        overdueInvoicesCount: d.overdueInvoicesCount,
        fromSnapshot: d.fromSnapshot,
      });
    }
    return out;
  }
}
