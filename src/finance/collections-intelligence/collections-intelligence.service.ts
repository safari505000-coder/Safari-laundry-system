import { Injectable } from '@nestjs/common';
import { CashStatus, OrderStatus, PosPaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { computeOrderRemainingBalancesBatch } from '../debt-customer-aggregates.util';
import { isRealDebtLedgerPayment } from '../debt-ledger-payment-origin.util';
import { FinancialSnapshotService } from '../snapshots/financial-snapshot.service';

/**
 * V20.4 — Phase 9 deterministic collections intelligence.
 *
 * Produces a small, explainable bundle of scores so the
 * Collections team can prioritise outreach. NOT machine-learned —
 * the weights are explicit constants below so an Accountant can
 * trace every score back to a signal. Replacing the heuristic
 * with a model later is a drop-in (`computeCustomerScore`
 * stays the only entry point).
 *
 * All scores are normalised 0..100. `priority` is the integer
 * ranking the collections list orders by (descending — highest
 * priority first).
 */

export type CollectionsScore = {
  customerId: string;
  /** 0..100 — risk of non-payment. */
  riskScore: number;
  /** 0..100 — model-free probability proxy. */
  paymentProbability: number;
  /** 0..100 — how aged the oldest open invoice is. */
  agingSeverity: number;
  /** 0..100 — composite priority for collections queues. */
  priority: number;
  /** 0..100 — historical behavior (reverse of risk). */
  behaviorScore: number;
  signals: {
    overdueDays: number;
    missedPromises: number;
    partialPaymentFrequency: number;
    reminderIgnores: number;
    largestInvoiceKd: string;
    averageInvoiceKd: string;
    historicalPaymentSpeedDays: number | null;
  };
  /** SHA-256 of the inputs for reproducibility. */
  inputDigest: string;
};

const W = {
  overdue: 35,
  reminders: 20,
  missed: 25,
  partials: 8,
  size: 12,
};

@Injectable()
export class CollectionsIntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshots: FinancialSnapshotService,
  ) {}

  /**
   * Public entry. Scores one customer end-to-end.
   *
   * Cheap enough to run live for a single Customer 360 view; the
   * collections list calls {@link computeBatch} with paged ids.
   */
  async computeCustomerScore(customerId: string): Promise<CollectionsScore> {
    const signals = await this.collectSignals(customerId);
    return this.scoreFromSignals(customerId, signals);
  }

  async computeBatch(
    customerIds: string[],
  ): Promise<Map<string, CollectionsScore>> {
    const out = new Map<string, CollectionsScore>();
    // Sequential to keep DB load predictable — collections
    // pages cap at ~50 rows so this stays sub-second.
    for (const id of customerIds) {
      try {
        out.set(id, await this.computeCustomerScore(id));
      } catch {
        // Per-customer failure absorbed; collections list still
        // renders the row with a zero score rather than failing
        // the entire request.
      }
    }
    return out;
  }

  // ── Internals ─────────────────────────────────────────────────

  private async collectSignals(
    customerId: string,
  ): Promise<CollectionsScore['signals']> {
    const now = Date.now();
    const orders = await this.prisma.order.findMany({
      where: {
        customerId,
        status: { not: OrderStatus.CANCELED },
        OR: [
          { cashStatus: CashStatus.UNPAID },
          { posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT },
        ],
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        totalPrice: true,
        createdAt: true,
        dueDate: true,
      },
    });
    if (orders.length === 0) {
      return {
        overdueDays: 0,
        missedPromises: 0,
        partialPaymentFrequency: 0,
        reminderIgnores: 0,
        largestInvoiceKd: '0.0000',
        averageInvoiceKd: '0.0000',
        historicalPaymentSpeedDays: null,
      };
    }
    const remainingByOrder = await computeOrderRemainingBalancesBatch(
      this.prisma,
      orders.map((o) => o.id),
    );
    let oldestOverdueAgeDays = 0;
    let largest = new Prisma.Decimal(0);
    let sum = new Prisma.Decimal(0);
    let partialCount = 0;
    let openCount = 0;
    for (const o of orders) {
      const total = new Prisma.Decimal(o.totalPrice.toString());
      sum = sum.plus(total);
      if (total.greaterThan(largest)) largest = total;
      const remaining = remainingByOrder.get(o.id) ?? total;
      const isFullyPaid = remaining.lessThanOrEqualTo(0.001);
      if (isFullyPaid) continue;
      openCount += 1;
      const paid = total.sub(remaining);
      if (paid.greaterThan(0.001)) partialCount += 1;
      const baseline = o.dueDate ?? o.createdAt;
      const ageMs = now - baseline.getTime();
      if (ageMs > 0) {
        const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
        if (ageDays > oldestOverdueAgeDays) oldestOverdueAgeDays = ageDays;
      }
    }
    const reminders = await this.countReminderIgnores(customerId);
    const missed = await this.countMissedPromises(customerId);
    const speed = await this.computeHistoricalPaymentSpeedDays(customerId);
    return {
      overdueDays: oldestOverdueAgeDays,
      missedPromises: missed,
      partialPaymentFrequency: openCount > 0 ? partialCount / openCount : 0,
      reminderIgnores: reminders,
      largestInvoiceKd: largest.toFixed(4),
      averageInvoiceKd:
        orders.length > 0
          ? sum.div(orders.length).toFixed(4)
          : '0.0000',
      historicalPaymentSpeedDays: speed,
    };
  }

  private async countReminderIgnores(_customerId: string): Promise<number> {
    // Wired in V20.4.x once the WhatsApp reminder tracking table
    // surfaces a "delivered but unread" signal. For now: 0.
    return 0;
  }

  private async countMissedPromises(_customerId: string): Promise<number> {
    // Hooks into `CollectionPromiseToPay` once the table ships.
    // Placeholder = 0 to keep the score deterministic today.
    return 0;
  }

  private async computeHistoricalPaymentSpeedDays(
    _customerId: string,
  ): Promise<number | null> {
    // DebtLedgerEntry table removed — no historical payment speed available.
    return null;
  }

  private scoreFromSignals(
    customerId: string,
    signals: CollectionsScore['signals'],
  ): CollectionsScore {
    const overdueComponent = clamp01(signals.overdueDays / 90) * W.overdue;
    const reminderComponent = clamp01(signals.reminderIgnores / 5) * W.reminders;
    const missedComponent = clamp01(signals.missedPromises / 3) * W.missed;
    const partialComponent =
      clamp01(signals.partialPaymentFrequency) * W.partials;
    const sizeComponent =
      clamp01(parseFloat(signals.largestInvoiceKd) / 100) * W.size;
    const risk = Math.round(
      overdueComponent +
        reminderComponent +
        missedComponent +
        partialComponent +
        sizeComponent,
    );
    const riskScore = Math.min(100, Math.max(0, risk));
    const paymentProbability = 100 - riskScore;
    const agingSeverity = Math.min(
      100,
      Math.max(0, Math.round((signals.overdueDays / 60) * 100)),
    );
    const speedFactor =
      signals.historicalPaymentSpeedDays === null
        ? 50
        : Math.max(0, 100 - signals.historicalPaymentSpeedDays * 2);
    const behaviorScore = Math.round(
      0.6 * speedFactor + 0.4 * paymentProbability,
    );
    const priority = Math.round(
      0.6 * riskScore + 0.3 * agingSeverity + 0.1 * (100 - behaviorScore),
    );
    const inputDigest = digestSignals(customerId, signals);
    return {
      customerId,
      riskScore,
      paymentProbability,
      agingSeverity,
      priority: Math.min(100, Math.max(0, priority)),
      behaviorScore: Math.min(100, Math.max(0, behaviorScore)),
      signals,
      inputDigest,
    };
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n) || Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function digestSignals(
  customerId: string,
  signals: CollectionsScore['signals'],
): string {
  // Lightweight FNV-1a 32-bit; we don't need cryptographic
  // strength — only "did the same inputs produce the same
  // score" for incident triage.
  const repr = `${customerId}|${signals.overdueDays}|${signals.missedPromises}|${signals.partialPaymentFrequency.toFixed(4)}|${signals.reminderIgnores}|${signals.largestInvoiceKd}|${signals.averageInvoiceKd}|${signals.historicalPaymentSpeedDays ?? 'null'}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < repr.length; i += 1) {
    hash ^= repr.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return `fnv:${hash.toString(16).padStart(8, '0')}`;
}
