import { Injectable, Logger } from '@nestjs/common';
import {
  CommissionCalculationBase,
  CommissionMode,
  CommissionPayoutStatus,
  CommissionPayoutTiming,
  PosPaymentMethod,
  Prisma,
  SafariRole,
  SystemToggleKey,
} from '@prisma/client';
import { computeOrderBankFeeKd } from '../payment-method-fees/bank-fee.util';
import { PaymentMethodFeesService } from '../payment-method-fees/payment-method-fees.service';
import { PrismaService } from '../prisma/prisma.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';

/**
 * V19.16 — pure earning engine for commissions. Exposes two hooks that
 * the callers wire at the right moment in their own flows:
 *
 *   • `earnForOrder(orderId)` — called when an Order reaches its
 *     settlement point (completedAt stamped). Creates a SALE-mode
 *     payout per matching active rule.
 *   • `earnForDebtPayment(debtEntryId)` — called right after a
 *     DebtLedgerEntry with source=PAYMENT has been persisted. Creates
 *     a COLLECTION-mode payout per matching active rule.
 *
 * Both hooks are idempotent (unique indexes on
 * `CommissionPayout(sourceOrderId, ruleId, earnerUserId)` and
 * `(sourceDebtEntryId, ruleId, earnerUserId)`) so replaying the event
 * will not double-earn.
 *
 * The `release(...)` / `scanEndOfMonthReleases()` methods promote
 * PENDING payouts to RELEASED based on the rule's `payoutTiming`.
 * They never mutate earned rows created by a different timing than
 * what they target, so they're safe to run from a cron AND from an
 * explicit Owner "release now" button.
 */
@Injectable()
export class CommissionEarningService {
  private readonly logger = new Logger(CommissionEarningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemSettings: SystemSettingsService,
    private readonly paymentMethodFees: PaymentMethodFeesService,
  ) {}

  // ─── Entry points ─────────────────────────────────────────────────

  /**
   * Generate SALE payouts for an order that just reached settlement.
   * Silently no-ops when:
   *   • the COMMISSION master toggle is off,
   *   • the order has no effective earner (no driverId and no
   *     transferredFromDriverId),
   *   • no active SALE rule matches the earner's role.
   *
   * `tx` lets the caller run inside an existing Prisma transaction so
   * commission rows and the order-completion update hit the DB atomically.
   */
  async earnForOrder(
    orderId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const enabled = await this.systemSettings.isEnabled(
      SystemToggleKey.COMMISSION,
    );
    if (!enabled) return;

    const db = tx ?? this.prisma;
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        totalPrice: true,
        posPaymentMethod: true,
        subscriptionId: true,
        driverId: true,
        transferredFromDriverId: true,
        status: true,
      },
    });
    if (!order) return;
    const earnerUserId = order.transferredFromDriverId ?? order.driverId;
    if (!earnerUserId) return;

    const earner = await db.user.findUnique({
      where: { id: earnerUserId },
      select: { id: true, safariRole: true },
    });
    if (!earner) return;

    const rules = await this.pickActiveRules(
      db,
      CommissionMode.SALE,
      earner.safariRole,
    );
    if (rules.length === 0) return;

    const feeConfig = await this.paymentMethodFees.getConfig();

    for (const rule of rules) {
      const basis = this.computeBasisForSale(
        order.totalPrice,
        order.posPaymentMethod,
        order.subscriptionId,
        rule.calculationBase,
        feeConfig,
      );
      if (basis.isZero() || basis.isNegative()) continue;
      if (basis.lessThan(rule.minInvoiceAmount)) continue;

      const amount = basis.mul(rule.percentage).div(100);
      const releaseNow = rule.payoutTiming === CommissionPayoutTiming.IMMEDIATE;
      try {
        await db.commissionPayout.create({
          data: {
            ruleId: rule.id,
            earnerUserId,
            mode: CommissionMode.SALE,
            basisAmount: basis.toFixed(4),
            percentage: rule.percentage,
            amount: amount.toFixed(4),
            sourceOrderId: order.id,
            status: releaseNow
              ? CommissionPayoutStatus.RELEASED
              : CommissionPayoutStatus.PENDING,
            releasedAt: releaseNow ? new Date() : null,
          },
        });
      } catch (err) {
        // Unique-constraint violation = duplicate event replay; log & skip.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          this.logger.debug(
            `SALE payout already exists for order=${order.id} rule=${rule.id}; skipping replay`,
          );
          continue;
        }
        throw err;
      }
    }
  }

  /**
   * Generate COLLECTION payouts for a payment captured in the Journal.
   *
   * V20.4 — replaces the legacy `earnForDebtPayment(debtEntryId)` which
   * used DebtLedgerEntry.id as the idempotency key. The Journal-based path
   * uses JournalEntry.id so DebtLedgerEntry can be fully removed.
   *
   * The commission basis (amount) is derived from the CR on account 1300
   * (Accounts Receivable) in the journal entry — that credit equals the
   * cash received from the customer.
   *
   * Silently no-ops when the toggle is off, the entry has no order
   * attribution, the AR credit is zero, or no active COLLECTION rule matches.
   */
  async earnForJournalPayment(
    journalEntryId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const enabled = await this.systemSettings.isEnabled(
      SystemToggleKey.COMMISSION,
    );
    if (!enabled) return;

    const db = tx ?? this.prisma;
    const entry = await db.journalEntry.findUnique({
      where: { id: journalEntryId },
      select: {
        id: true,
        source: true,
        orderId: true,
        lines: {
          where: { account: { code: '1300' } },
          select: { credit: true, meta: true },
        },
      },
    });
    if (!entry || entry.source !== 'PAYMENT') return;
    if (!entry.orderId) return;

    // Commission basis = CR on AR (account 1300) — the amount the customer
    // actually paid in cash. CORRUPT-5: exclude wallet-absorption credits
    // (DR WALLET_LIABILITY / CR AR) — those are not real cash collection events.
    const basis = entry.lines
      .filter((l) => {
        const m = l.meta as Record<string, unknown> | null;
        return (
          m?.origin !== 'WALLET_ABSORPTION' &&
          m?.event !== 'WALLET_ABSORPTION' &&
          m?.event !== 'WALLET_ABSORPTION_V3'
        );
      })
      .reduce((sum, l) => sum.add(new Prisma.Decimal(l.credit.toString())), new Prisma.Decimal(0));
    if (basis.lessThanOrEqualTo(0)) return;

    const order = await db.order.findUnique({
      where: { id: entry.orderId },
      select: {
        driverId: true,
        transferredFromDriverId: true,
      },
    });
    if (!order) return;
    const earnerUserId = order.transferredFromDriverId ?? order.driverId;
    if (!earnerUserId) return;

    const earner = await db.user.findUnique({
      where: { id: earnerUserId },
      select: { id: true, safariRole: true },
    });
    if (!earner) return;

    const rules = await this.pickActiveRules(
      db,
      CommissionMode.COLLECTION,
      earner.safariRole,
    );
    if (rules.length === 0) return;

    for (const rule of rules) {
      if (basis.lessThan(rule.minInvoiceAmount)) continue;
      const amount = basis.mul(rule.percentage).div(100);
      const releaseNow = rule.payoutTiming === CommissionPayoutTiming.IMMEDIATE;
      try {
        await db.commissionPayout.create({
          data: {
            ruleId: rule.id,
            earnerUserId,
            mode: CommissionMode.COLLECTION,
            basisAmount: basis.toFixed(4),
            percentage: rule.percentage,
            amount: amount.toFixed(4),
            sourceJournalEntryId: entry.id,
            status: releaseNow
              ? CommissionPayoutStatus.RELEASED
              : CommissionPayoutStatus.PENDING,
            releasedAt: releaseNow ? new Date() : null,
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          this.logger.debug(
            `COLLECTION payout already exists for journalEntry=${entry.id} rule=${rule.id}; skipping replay`,
          );
          continue;
        }
        throw err;
      }
    }
  }

  // ─── Release scheduler ────────────────────────────────────────────

  /**
   * Called whenever an order's debt reaches zero (or a debt PAYMENT
   * fully covers the open amount): promote PENDING payouts tied to
   * that order whose rule uses AFTER_COLLECTION timing.
   */
  async releaseAfterCollectionForOrder(
    orderId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const db = tx ?? this.prisma;
    // INFLATE-2: don't release AFTER_COLLECTION commissions when the order was
    // settled entirely from wallet credit (SUBSCRIPTION_WALLET). Wallet payments
    // are not real cash collection events and should not trigger collection commission.
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: { posPaymentMethod: true },
    });
    if (order?.posPaymentMethod === PosPaymentMethod.SUBSCRIPTION_WALLET) {
      this.logger.debug(
        `[COMMISSION] Skipping AFTER_COLLECTION release for wallet-funded order=${orderId}`,
      );
      return 0;
    }
    const res = await db.commissionPayout.updateMany({
      where: {
        sourceOrderId: orderId,
        status: CommissionPayoutStatus.PENDING,
        rule: { payoutTiming: CommissionPayoutTiming.AFTER_COLLECTION },
      },
      data: {
        status: CommissionPayoutStatus.RELEASED,
        releasedAt: new Date(),
      },
    });
    return res.count;
  }

  /**
   * Promote END_OF_MONTH-timed PENDING payouts whose `earnedAt` falls
   * on or before `asOf`. Meant to be invoked by a monthly cron (or the
   * Owner's "close period" button). Idempotent.
   */
  async releaseEndOfMonth(asOf: Date): Promise<number> {
    const res = await this.prisma.commissionPayout.updateMany({
      where: {
        status: CommissionPayoutStatus.PENDING,
        earnedAt: { lte: asOf },
        rule: { payoutTiming: CommissionPayoutTiming.END_OF_MONTH },
      },
      data: {
        status: CommissionPayoutStatus.RELEASED,
        releasedAt: new Date(),
      },
    });
    return res.count;
  }

  /**
   * Reverse an earning (e.g. order voided, debt refund). Flips any
   * non-PAID payouts back to CANCELLED. Does NOT touch PAID rows —
   * those have already hit a Payroll row and require a manual
   * adjustment entry by Owner.
   */
  async cancelForOrder(
    orderId: string,
    reason: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const db = tx ?? this.prisma;
    const res = await db.commissionPayout.updateMany({
      where: {
        sourceOrderId: orderId,
        status: { not: CommissionPayoutStatus.PAID },
      },
      data: {
        status: CommissionPayoutStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: reason,
      },
    });
    return res.count;
  }

  // ─── Internals ────────────────────────────────────────────────────

  private async pickActiveRules(
    db: Prisma.TransactionClient | PrismaService,
    mode: CommissionMode,
    earnerRole: SafariRole,
  ) {
    const rules = await db.commissionRule.findMany({
      where: {
        mode,
        isActive: true,
        OR: [{ role: null }, { role: earnerRole }],
      },
      orderBy: [{ role: 'desc' }, { updatedAt: 'desc' }],
    });
    const specific = rules.filter((rule) => rule.role === earnerRole);
    return specific.length > 0 ? specific : rules.filter((rule) => rule.role == null);
  }

  /**
   * Map a SALE rule's `calculationBase` onto a KD amount.
   *
   *  ORDER_TOTAL / INVOICE_TOTAL → raw `totalPrice` (split reserved
   *                                 for a future V19.17 invoice model).
   *  NET_AFTER_KNET              → subtract acquirer fee for KNET/card
   *                                 methods; cash orders = gross.
   *  EXCLUDE_SUBSCRIPTIONS       → zero for subscription-backed orders,
   *                                 else raw total.
   */
  private computeBasisForSale(
    totalPrice: Prisma.Decimal,
    posPaymentMethod: PosPaymentMethod | null,
    subscriptionId: string | null,
    base: CommissionCalculationBase,
    feeConfig: Awaited<ReturnType<PaymentMethodFeesService['getConfig']>>,
  ): Prisma.Decimal {
    const gross = new Prisma.Decimal(totalPrice.toString());
    switch (base) {
      case CommissionCalculationBase.ORDER_TOTAL:
      case CommissionCalculationBase.INVOICE_TOTAL:
        return gross;
      case CommissionCalculationBase.NET_AFTER_KNET: {
        const fee = computeOrderBankFeeKd(gross, posPaymentMethod, feeConfig);
        return gross.sub(fee);
      }
      case CommissionCalculationBase.EXCLUDE_SUBSCRIPTIONS:
        return subscriptionId ? new Prisma.Decimal(0) : gross;
      default:
        return gross;
    }
  }
}
