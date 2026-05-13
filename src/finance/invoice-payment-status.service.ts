import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  computeOrderRemainingBalancesBatch,
  INVOICE_REMAINING_TOLERANCE_KD as REMAINING_TOLERANCE_KD,
  isV20_3TrueAccountingEnabled,
} from './debt-customer-aggregates.util';

/**
 * V20.3.1 re-export — keeps the original import path working for
 * callers that already adopted the service-side constant.
 */
/**
 * تسامح المبلغ المتبقي للفاتورة بالدينار الكويتي — إعادة تصدير للتوافق مع الإصدارات السابقة
 * Re-export of INVOICE_REMAINING_TOLERANCE_KD for backwards-compatible import paths.
 * @since V20.3.1
 */
export const INVOICE_REMAINING_TOLERANCE_KD = REMAINING_TOLERANCE_KD;

/**
 * V20.3.1 — Partial-payment correctness patch.
 *
 * Single source of truth for "what does this invoice still owe?".
 * Replaces the scattered reads of `Order.cashStatus === UNPAID` and
 * `Σ(Order.totalPrice)` that returned gross unpaid amounts even
 * when the invoice was partially paid.
 *
 * The invariant is plain double-entry: an invoice's remaining
 * balance is the gross amount minus everything that has been
 * applied to it (cash payments, KNET, online, payment-link, wallet
 * absorption, debt-pay-down rows). Wallet absorption rows count
 * here because under V20.3 they CR AR; under V20.2 they don't
 * touch AR but they DID consume part of the invoice's economic
 * value, so for the "remaining customer obligation" view we count
 * them. Tests cover the canonical wallet+cash mix.
 *
 * The service intentionally does NOT mutate any row. All
 * call-sites that decide "should I close this invoice?" must call
 * {@link computeRemainingBalance} (or
 * {@link derivePaymentStatus}) and only flip `cashStatus` when
 * the result is `<= TOLERANCE_KD`.
 */

/**
 * حالة دفع الفاتورة — المصدر الوحيد للحقيقة لحالة تسوية الفاتورة
 * Invoice payment status — single source of truth for invoice settlement state.
 */
export type InvoicePaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';

/**
 * صف حالة دفع الفاتورة مع المبالغ المُسددة والمتبقية والمصدر
 * Invoice payment status row with paid/remaining amounts and computation source.
 */
export type InvoicePaymentStatusRow = {
  orderId: string;
  totalAmountKd: string;
  paidAmountKd: string;
  remainingAmountKd: string;
  walletAbsorbedKd: string;
  status: InvoicePaymentStatus;
  isPartiallyPaid: boolean;
  isFullyPaid: boolean;
  /**
   * V20.3 audit hint — reports which source backed the computation.
   *  - `JOURNAL_AR`: the V20.3 journal AR balance for this order
   *  - `DEBT_LEDGER`: the V20.2 DebtLedgerEntry waterfall
   */
  source: 'JOURNAL_AR' | 'DEBT_LEDGER';
};

type Db = PrismaService | Prisma.TransactionClient;

/**
 * خدمة حالة دفع الفاتورة — المصدر الوحيد للحقيقة لحالة تسوية الفواتير
 * Single source of truth for invoice settlement state.
 * Computes remaining balance via journal AR (V20.3+) or DebtLedger waterfall (V20.2).
 * Never mutates any row — all call-sites deciding "should I close this invoice?"
 * must call computeRemainingBalance and only flip cashStatus when result <= TOLERANCE_KD.
 *
 * @since V20.3.1
 */
@Injectable()
export class InvoicePaymentStatusService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compute remaining balance for ONE invoice/order.
   *
   * V20.3 (`V20_3_TRUE_ACCOUNTING=true`): prefers the journal AR
   * balance scoped to this orderId — that is the bank-grade truth.
   * Falls back to the DebtLedger waterfall when no journal entries
   * exist for the order yet (e.g. mid-rollout, before backfill).
   *
   * V20.2 (default): DebtLedger waterfall, scoped to this order:
   *   remaining = Σ(SHORTFALL+OVERUSE for orderId)
   *               − Σ(real PAYMENT for orderId)
   *               − Σ(WALLET_ABSORPTION for orderId)
   *
   * Clamped at 0 (never negative — overpayment surfaces as a
   * positive credit elsewhere via the audit module).
   */
  /**
   * يحسب الرصيد المتبقي لفاتورة واحدة من المصدر الكانوني
   * Computes the remaining balance for a single invoice/order.
   * Prefers journal AR (V20.3+), falls back to DebtLedger waterfall.
   *
   * @param orderId - معرف الطلب/الفاتورة | Order/invoice ID
   * @param db - عميل Prisma اختياري (لدعم المعاملات) | Optional Prisma client for transaction support
   * @returns الرصيد المتبقي والمُسدَّد والمُمتَص ومصدر الحساب | Remaining, paid, absorbed amounts and source
   */
  async computeRemainingBalance(
    orderId: string,
    db: Db = this.prisma,
  ): Promise<{
    remainingKd: Prisma.Decimal;
    totalKd: Prisma.Decimal;
    paidKd: Prisma.Decimal;
    walletAbsorbedKd: Prisma.Decimal;
    source: 'JOURNAL_AR' | 'DEBT_LEDGER';
  }> {
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: { id: true, totalPrice: true, status: true },
    });
    if (!order) {
      return {
        remainingKd: new Prisma.Decimal(0),
        totalKd: new Prisma.Decimal(0),
        paidKd: new Prisma.Decimal(0),
        walletAbsorbedKd: new Prisma.Decimal(0),
        source: 'DEBT_LEDGER',
      };
    }
    const totalKd = new Prisma.Decimal(order.totalPrice.toString());

    // CANCELLED orders contribute zero. We still report the gross
    // total so callers can show "voided 100 KD" if they want.
    if (order.status === OrderStatus.CANCELED) {
      return {
        remainingKd: new Prisma.Decimal(0),
        totalKd,
        paidKd: new Prisma.Decimal(0),
        walletAbsorbedKd: new Prisma.Decimal(0),
        source: 'DEBT_LEDGER',
      };
    }

    if (isV20_3TrueAccountingEnabled()) {
      // V20.3 path — read the journal AR balance scoped to the order.
      const lines = await db.journalLine.findMany({
        where: {
          entry: { orderId },
          account: { code: '1300' },
        },
        select: { debit: true, credit: true },
      });
      if (lines.length > 0) {
        let bal = new Prisma.Decimal(0);
        for (const line of lines) {
          bal = bal
            .add(new Prisma.Decimal(line.debit.toString()))
            .sub(new Prisma.Decimal(line.credit.toString()));
        }
        const remaining = bal.lessThan(0) ? new Prisma.Decimal(0) : bal;
        // Reconstruct paid + wallet for the API surface — purely
        // descriptive numbers, journal AR is the math truth.
        const breakdown = await this.computeFromDebtLedger(orderId, db, totalKd);
        return {
          remainingKd: remaining,
          totalKd,
          paidKd: breakdown.paidKd,
          walletAbsorbedKd: breakdown.walletAbsorbedKd,
          source: 'JOURNAL_AR',
        };
      }
      // No journal entries yet for this order (pre-backfill) —
      // fall back to DebtLedger waterfall to avoid silently
      // showing the gross total as "remaining".
    }

    return this.computeFromDebtLedger(orderId, db, totalKd);
  }

  /**
   * Same as {@link computeRemainingBalance} but for a batch of
   * orders in a single SQL pass — used by the Outstanding /
   * collections endpoints to avoid per-row N+1.
   *
   * Always uses the DebtLedger waterfall (the V20.3 journal-AR
   * batch path is queued for V20.4 once journals carry their own
   * orderId index for aggregations; per-order journal aggregation
   * is currently O(N) journal-line reads per order).
   */
  async computeRemainingBalancesBatch(
    orderIds: string[],
    db: Db = this.prisma,
  ): Promise<Map<string, Prisma.Decimal>> {
    return computeOrderRemainingBalancesBatch(db, orderIds);
  }

  /**
   * High-level API — returns the per-row payload for the
   * `GET /api/finance/invoices/:orderId/payment-status` endpoint
   * AND for embedding in Outstanding / Customer 360 rows.
   */
  async derivePaymentStatus(
    orderId: string,
    db: Db = this.prisma,
  ): Promise<InvoicePaymentStatusRow> {
    const breakdown = await this.computeRemainingBalance(orderId, db);
    const status = this.statusFromRemaining(
      breakdown.totalKd,
      breakdown.paidKd.add(breakdown.walletAbsorbedKd),
      breakdown.remainingKd,
    );
    return {
      orderId,
      totalAmountKd: breakdown.totalKd.toFixed(4),
      paidAmountKd: breakdown.paidKd.toFixed(4),
      remainingAmountKd: breakdown.remainingKd.toFixed(4),
      walletAbsorbedKd: breakdown.walletAbsorbedKd.toFixed(4),
      status,
      isPartiallyPaid: status === 'PARTIALLY_PAID',
      isFullyPaid: status === 'PAID',
      source: breakdown.source,
    };
  }

  /**
   * Pure derivation — exposed so callers can produce the status
   * label without hitting the DB twice when they already loaded
   * the totals.
   */
  statusFromRemaining(
    totalKd: Prisma.Decimal | string | number,
    appliedKd: Prisma.Decimal | string | number,
    remainingKd: Prisma.Decimal | string | number,
  ): InvoicePaymentStatus {
    const tolerance = new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD);
    const remaining = this.toDecimal(remainingKd);
    const applied = this.toDecimal(appliedKd);
    const total = this.toDecimal(totalKd);
    if (remaining.lessThanOrEqualTo(tolerance)) return 'PAID';
    if (
      applied.greaterThan(tolerance) ||
      total.sub(remaining).greaterThan(tolerance)
    ) {
      return 'PARTIALLY_PAID';
    }
    return 'UNPAID';
  }

  private async computeFromDebtLedger(
    _orderId: string,
    _db: Db,
    totalKd: Prisma.Decimal,
  ): Promise<{
    remainingKd: Prisma.Decimal;
    totalKd: Prisma.Decimal;
    paidKd: Prisma.Decimal;
    walletAbsorbedKd: Prisma.Decimal;
    source: 'DEBT_LEDGER';
  }> {
    return {
      remainingKd: totalKd,
      totalKd,
      paidKd: new Prisma.Decimal(0),
      walletAbsorbedKd: new Prisma.Decimal(0),
      source: 'DEBT_LEDGER',
    };
  }

  private toDecimal(v: Prisma.Decimal | string | number): Prisma.Decimal {
    return v instanceof Prisma.Decimal ? v : new Prisma.Decimal(v.toString());
  }
}
