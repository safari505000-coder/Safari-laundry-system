import { CashStatus, OrderStatus, PosPaymentMethod, Prisma } from '@prisma/client';
import {
  computeOrderRemainingBalancesBatch,
  INVOICE_REMAINING_TOLERANCE_KD,
  isV20_3TrueAccountingEnabled,
} from './debt-customer-aggregates.util';

/**
 * V20.3.2 — Phase 1 / Phase 3 / Phase 5 single source of truth.
 *
 * "Canonical customer debt" is the ONE number every UI surface
 * (Subscribers list, Outstanding, Customer 360, Call-Center
 * tiles, dashboards) MUST display when it shows a customer's
 * outstanding balance.
 *
 *   • When `V20_3_TRUE_ACCOUNTING=true` it equals the live
 *     Journal AR balance (account 1300, clamped at zero) — the
 *     bank-grade number per V20.3 Phase 35.
 *   • Otherwise it equals the V20.3.1 partial-payment-aware
 *     `Σ remaining_balance` over the customer's in-collections
 *     orders (mirrors `OrdersService.getCollectionsReceivableSnapshotForCustomer`
 *     so subscribers / collections / outstanding all read the
 *     same waterfall result without a service-level dependency).
 *
 * The function is pure (delegate-typed `db`) and journal-side
 * is optional, so it can be called from any module / from
 * inside transactions / from the inspector without introducing
 * Nest module cycles. Failures fall back to the partial-payment
 * source — the helper is intentionally infallible because every
 * UI consumer expects a number.
 */

type Db = {
  order: Prisma.OrderDelegate;
  debtLedgerEntry: Prisma.DebtLedgerEntryDelegate;
};

export type JournalReader = {
  getCustomerDebtFromJournalAR: (customerId: string) => Promise<Prisma.Decimal>;
};

export type CanonicalDebtSource =
  /** V20.3 — live Journal AR balance on account 1300. */
  | 'JOURNAL_AR'
  /** V20.3.1 — Σ remaining_balance over in-collections invoices. */
  | 'PARTIAL_PAYMENT_REMAINING'
  /** Journal lookup failed; degraded back to remaining-payment sum. */
  | 'JOURNAL_AR_FALLBACK';

export type CanonicalDebtSnapshot = {
  customerId: string;
  /** The single canonical number every UI MUST render. KD, 4-dp. */
  canonicalDebtKd: Prisma.Decimal;
  /**
   * Σ remaining over in-collections invoices (V20.3.1). Always
   * computed because it's the back-compat reference and the
   * subscribers / collections / outstanding aggregates already
   * use it.
   */
  remainingFromInvoicesKd: Prisma.Decimal;
  /**
   * Live Journal AR (1300) when available, else null. Only
   * present when a {@link JournalReader} was provided.
   */
  journalArKd: Prisma.Decimal | null;
  /** Provenance — which source backed `canonicalDebtKd`. */
  source: CanonicalDebtSource;
  /** Set of order IDs that contributed to the remaining sum. */
  inScopeOrderIds: Set<string>;
};

/**
 * Compute the canonical debt for one customer.
 *
 * @param db                Prisma delegate-shaped reader.
 * @param journal           Optional journal reader. When the
 *                          V20.3 flag is on, journal AR wins;
 *                          otherwise it's only used to populate
 *                          `journalArKd` for inspector / drift
 *                          comparison.
 * @param customerId
 */
export async function computeCanonicalCustomerDebt(
  db: Db,
  journal: JournalReader | null,
  customerId: string,
): Promise<CanonicalDebtSnapshot> {
  // V20.3.1 partial-payment-aware: same scope as
  // OrdersService.getCollectionsReceivableSnapshotForCustomer.
  // Inlined here so the helper has zero service deps.
  const inScopeRows = await db.order.findMany({
    where: {
      customerId,
      status: { not: OrderStatus.CANCELED },
      OR: [
        { cashStatus: CashStatus.UNPAID },
        { posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT },
      ],
    },
    select: {
      id: true,
      customerId: true,
      cashStatus: true,
      posPaymentMethod: true,
    },
  });
  const orderIds = inScopeRows.map((r) => r.id);
  const inScopeOrderIds = new Set<string>(orderIds);
  let remainingFromInvoicesKd = new Prisma.Decimal(0);
  if (orderIds.length > 0) {
    const remainingByOrder = await computeOrderRemainingBalancesBatch(
      db,
      orderIds,
    );
    const tol = new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD);
    for (const id of orderIds) {
      const rem = remainingByOrder.get(id);
      if (!rem) continue;
      if (rem.lessThanOrEqualTo(tol)) {
        // Closed/fully-paid — drop from in-scope set so the
        // inspector and downstream UIs never count it again.
        inScopeOrderIds.delete(id);
        continue;
      }
      remainingFromInvoicesKd = remainingFromInvoicesKd.plus(rem);
    }
  }

  let journalArKd: Prisma.Decimal | null = null;
  let source: CanonicalDebtSource = 'PARTIAL_PAYMENT_REMAINING';
  let canonicalDebtKd = remainingFromInvoicesKd;

  if (journal) {
    try {
      journalArKd = await journal.getCustomerDebtFromJournalAR(customerId);
      if (isV20_3TrueAccountingEnabled() && journalArKd != null) {
        canonicalDebtKd = journalArKd;
        source = 'JOURNAL_AR';
      }
    } catch {
      // Journal read failed; degrade to remaining-payment sum.
      // We tag the source so the inspector can flag the row as
      // operating under a degraded read.
      if (isV20_3TrueAccountingEnabled()) {
        source = 'JOURNAL_AR_FALLBACK';
      }
    }
  }

  if (canonicalDebtKd.lessThan(0)) canonicalDebtKd = new Prisma.Decimal(0);

  return {
    customerId,
    canonicalDebtKd,
    remainingFromInvoicesKd,
    journalArKd,
    source,
    inScopeOrderIds,
  };
}

/**
 * Tolerance used by every drift comparison in the V20.3.2 stack.
 * Single import path so the inspector, the runtime assertion,
 * and the subscribers / collections KPIs stay in lockstep.
 */
export const UI_DEBT_CONSISTENCY_TOLERANCE_KD = '0.001';
