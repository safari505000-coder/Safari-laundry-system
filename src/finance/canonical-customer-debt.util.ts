import { CashStatus, OrderStatus, PosPaymentMethod, Prisma } from '@prisma/client';
import {
  computeOrderRemainingBalancesBatch,
  INVOICE_REMAINING_TOLERANCE_KD,
} from './debt-customer-aggregates.util';

/**
 * V20.3.2 — Phase 1 / Phase 3 / Phase 5 single source of truth.
 *
 * "Canonical customer debt" is the ONE number every UI surface
 * (Subscribers list, Outstanding, Customer 360, Call-Center
 * tiles, dashboards) MUST display when it shows a customer's
 * outstanding balance.
 *
 *   • When a journal reader is available it equals the live
 *     Journal AR balance (account 1300, clamped at zero) — the
 *     bank-grade number the customer statement exposes.
 *   • If the journal read is unavailable it falls back to the V20.3.1
 *     partial-payment-aware `Σ remaining_balance` over the customer's
 *     in-collections orders.
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
};

/**
 * واجهة قارئ دفتر اليومية المُمرَّرة لحساب ديون العملاء
 * Journal reader interface passed to canonical debt computation for decoupled journal access.
 */
export type JournalReader = {
  getCustomerDebtFromJournalAR: (customerId: string) => Promise<Prisma.Decimal>;
};

/**
 * مصدر الدين الكانوني — يُحدد مصدر بيانات الحساب المُستخدَم
 * Source identifier for the canonical debt computation path.
 */
export type CanonicalDebtSource =
  /** V20.3 — live Journal AR balance on account 1300. */
  | 'JOURNAL_AR'
  /** V20.3.1 — Σ remaining_balance over in-collections invoices. */
  | 'PARTIAL_PAYMENT_REMAINING'
  /** Journal lookup failed; degraded back to remaining-payment sum. */
  | 'JOURNAL_AR_FALLBACK';

/**
 * لقطة الدين الكانوني للعميل — النتيجة الشاملة لحساب الدين الموحد
 * Canonical debt snapshot for a customer, containing the single display-ready number
 * and all diagnostic fields for the drift inspector.
 */
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
 * يحسب الدين الكانوني لعميل واحد من المصدر الأكثر دقة المتاح
 * Computes the canonical debt for a single customer.
 * Prefers journal AR (account 1300) when the journal reader is provided;
 * degrades to partial-payment-aware remaining sum on journal read failure.
 *
 * @param db - قاعدة البيانات أو عميل المعاملة | Prisma delegate-shaped reader
 * @param journal - قارئ دفتر اليومية (اختياري) | Optional journal reader
 * @param customerId - معرف العميل | Customer ID
 * @returns لقطة الدين الكانوني | Canonical debt snapshot
 * @since V20.3.2
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
      if (journalArKd != null) {
        canonicalDebtKd = journalArKd;
        source = 'JOURNAL_AR';
      }
    } catch {
      // Journal read failed; degrade to remaining-payment sum.
      // We tag the source so the inspector can flag the row as
      // operating under a degraded read.
      source = 'JOURNAL_AR_FALLBACK';
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
 * تسامح الانحراف المُستخدَم في جميع مقارنات الاتساق في المكدس V20.3.2
 * Tolerance for every drift comparison in the V20.3.2 consistency stack (0.001 KD).
 * Single import path keeping inspector, runtime assertion, and KPIs in lockstep.
 */
export const UI_DEBT_CONSISTENCY_TOLERANCE_KD = '0.001';
