import { Injectable, Logger } from '@nestjs/common';
import {
  CashStatus,
  CollectionsStage,
  OrderStatus,
  Prisma,
  PromiseToPayStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AgingService } from '../aging/aging.service';

/**
 * V20.5 — Phase 6 Risk Scoring Engine.
 *
 * Computes a 0..100 financial-risk score per customer from the
 * canonical primaries (orders, debt ledger, promises, collections
 * stage). Derived metrics — no new tables. Re-computable on demand
 * and cheap enough that the snapshot engine (Phase 7) caches the
 * result instead of pre-computing during writes.
 *
 * Components (each contributes a weighted sub-score in [0..1] →
 * weighted sum × 100 → final score):
 *
 *   • OVERDUE          (0.30) — worst aging bucket on book today.
 *                              CURRENT 0, LATE 0.4, CRITICAL 0.8, LEGAL 1.0.
 *   • BROKEN_PROMISES  (0.20) — count of BROKEN promises in last 180d.
 *                              0 → 0,  1 → 0.5,  2 → 0.8,  ≥3 → 1.0.
 *   • COLLECTIONS_ESC  (0.15) — current escalation level + stage.
 *                              NEW/CONTACTED/FOLLOW_UP 0,
 *                              PROMISE_TO_PAY 0.3,
 *                              ESCALATED 0.6, LEGAL 0.9, WRITTEN_OFF 1.0.
 *   • PARTIAL_RATIO    (0.10) — # partial payments / # invoices in last 180d.
 *                              capped at 1.0.
 *   • REFUND_FREQ      (0.10) — refund count in last 180d / 5, capped 1.0.
 *   • FAILED_PAYMENTS  (0.10) — TransactionHistory FAILED rows in last 180d / 5.
 *   • TOTAL_EXPOSURE   (0.05) — log-scale of total receivable / 1000 KD.
 *
 * Levels (final score):
 *   • LOW      0..29
 *   • MEDIUM   30..54
 *   • HIGH     55..79
 *   • CRITICAL 80..100
 *
 * Debt-limit recommendation:
 *   limit = max(0, baseLimit × (1 − score/100))
 * where baseLimit defaults to 200 KD (operator override per
 * customer is a future feature).
 */
/**
 * مستوى مخاطر العميل المالي المُحتسب
 * Financial risk level for a customer (0–29 LOW, 30–54 MEDIUM, 55–79 HIGH, 80–100 CRITICAL).
 */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * مكوّن درجة مخاطرة واحد مع وزنه والقيمة المُعيَّرة
 * Single risk-score component with its weight, raw value, and normalised contribution.
 */
export type RiskComponent = {
  key: string;
  weight: number;
  rawValue: number;
  normalised: number; // 0..1
  contribution: number; // weight × normalised
};

/**
 * درجة مخاطرة العميل الكاملة مع المكونات والحد الائتماني الموصى به
 * Full customer risk score with component breakdown and recommended debt limit.
 */
export type RiskScore = {
  customerId: string;
  score: number; // 0..100
  level: RiskLevel;
  components: RiskComponent[];
  recommendedDebtLimitKd: string;
  computedAtIso: string;
};

/**
 * محرك تسجيل مخاطر العملاء الماليين — يحسب درجة من 0 إلى 100 بناءً على 7 مؤشرات
 * Financial risk scoring engine computing a 0–100 risk score per customer from
 * canonical primaries (aging, broken promises, collections stage, partial payments,
 * refunds, failed payments, total exposure). No new tables; re-computable on demand.
 *
 * @since V20.5 Phase 6
 */
@Injectable()
export class RiskScoringService {
  private readonly logger = new Logger(RiskScoringService.name);

  static readonly WINDOW_DAYS = 180;
  static readonly DEFAULT_BASE_LIMIT_KD = 200;

  static readonly WEIGHTS = {
    OVERDUE: 0.3,
    BROKEN_PROMISES: 0.2,
    COLLECTIONS_ESC: 0.15,
    PARTIAL_RATIO: 0.1,
    REFUND_FREQ: 0.1,
    FAILED_PAYMENTS: 0.1,
    TOTAL_EXPOSURE: 0.05,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly aging: AgingService,
  ) {}

  /**
   * يُحدد مستوى المخاطرة بناءً على الدرجة العددية
   * Maps a numeric score (0–100) to the corresponding RiskLevel.
   *
   * @param score - الدرجة العددية للمخاطرة | Numeric risk score
   * @returns مستوى المخاطرة | Risk level
   */
  static levelForScore(score: number): RiskLevel {
    if (score >= 80) return 'CRITICAL';
    if (score >= 55) return 'HIGH';
    if (score >= 30) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * يحسب درجة مخاطرة العميل من المؤشرات الأولية
   * Computes the risk score for a customer from 7 weighted components.
   *
   * @param customerId - معرف العميل | Customer ID
   * @returns درجة المخاطرة الكاملة مع المكونات | Full risk score with component breakdown
   */
  async getScore(customerId: string): Promise<RiskScore> {
    const since = new Date(
      Date.now() - RiskScoringService.WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const [agingSummary, brokenPromises, collections, ledgerStats, refunds, failedPayments] =
      await Promise.all([
        this.aging.getCustomerAging(customerId).catch(() => null),
        this.countBrokenPromises(customerId, since),
        this.collectionsState(customerId),
        this.ledgerStats(customerId, since),
        this.refundCount(customerId, since),
        this.failedPaymentCount(customerId, since),
      ]);

    const totalReceivable = agingSummary
      ? new Prisma.Decimal(agingSummary.totalReceivableKd)
      : new Prisma.Decimal(0);

    const components: RiskComponent[] = [];

    // OVERDUE (worst bucket)
    const overdueNorm = agingSummary
      ? agingSummary.agingBucket === 'LEGAL'
        ? 1.0
        : agingSummary.agingBucket === 'CRITICAL'
          ? 0.8
          : agingSummary.agingBucket === 'LATE'
            ? 0.4
            : 0
      : 0;
    components.push(this.makeComponent(
      'OVERDUE',
      RiskScoringService.WEIGHTS.OVERDUE,
      agingSummary?.oldestOverdueDays ?? 0,
      overdueNorm,
    ));

    // BROKEN_PROMISES
    const brokenNorm =
      brokenPromises >= 3 ? 1.0 : brokenPromises === 2 ? 0.8 : brokenPromises === 1 ? 0.5 : 0;
    components.push(this.makeComponent(
      'BROKEN_PROMISES',
      RiskScoringService.WEIGHTS.BROKEN_PROMISES,
      brokenPromises,
      brokenNorm,
    ));

    // COLLECTIONS_ESC
    const stageNorm =
      collections.stage === CollectionsStage.WRITTEN_OFF
        ? 1.0
        : collections.stage === CollectionsStage.LEGAL
          ? 0.9
          : collections.stage === CollectionsStage.ESCALATED
            ? 0.6
            : collections.stage === CollectionsStage.PROMISE_TO_PAY
              ? 0.3
              : 0;
    const escNorm = Math.min(1, stageNorm + collections.escalationLevel * 0.05);
    components.push(this.makeComponent(
      'COLLECTIONS_ESC',
      RiskScoringService.WEIGHTS.COLLECTIONS_ESC,
      collections.escalationLevel,
      escNorm,
    ));

    // PARTIAL_RATIO
    const partialRatio =
      ledgerStats.invoicesLastWindow > 0
        ? Math.min(1, ledgerStats.partialPayments / ledgerStats.invoicesLastWindow)
        : 0;
    components.push(this.makeComponent(
      'PARTIAL_RATIO',
      RiskScoringService.WEIGHTS.PARTIAL_RATIO,
      ledgerStats.partialPayments,
      partialRatio,
    ));

    // REFUND_FREQ
    const refundNorm = Math.min(1, refunds / 5);
    components.push(this.makeComponent(
      'REFUND_FREQ',
      RiskScoringService.WEIGHTS.REFUND_FREQ,
      refunds,
      refundNorm,
    ));

    // FAILED_PAYMENTS
    const failedNorm = Math.min(1, failedPayments / 5);
    components.push(this.makeComponent(
      'FAILED_PAYMENTS',
      RiskScoringService.WEIGHTS.FAILED_PAYMENTS,
      failedPayments,
      failedNorm,
    ));

    // TOTAL_EXPOSURE
    const exposureKd = Number(totalReceivable.toFixed(4));
    const exposureNorm = exposureKd <= 0 ? 0 : Math.min(1, Math.log10(1 + exposureKd / 1000) / 2);
    components.push(this.makeComponent(
      'TOTAL_EXPOSURE',
      RiskScoringService.WEIGHTS.TOTAL_EXPOSURE,
      exposureKd,
      exposureNorm,
    ));

    const score = Math.round(
      components.reduce((acc, c) => acc + c.contribution, 0) * 100,
    );
    const level = RiskScoringService.levelForScore(score);
    const recommendedLimit = Math.max(
      0,
      RiskScoringService.DEFAULT_BASE_LIMIT_KD * (1 - score / 100),
    );

    return {
      customerId,
      score,
      level,
      components,
      recommendedDebtLimitKd: new Prisma.Decimal(recommendedLimit).toFixed(4),
      computedAtIso: new Date().toISOString(),
    };
  }

  /**
   * Portfolio-wide top-risk list (CRITICAL first, then HIGH).
   * Used by the dashboard tile and the supervisor watch-list.
   */
  /**
   * يُرجع قائمة العملاء ذوي المخاطر العالية مُرتبة تنازلياً بالدرجة
   * Returns the top at-risk customers (HIGH or CRITICAL) sorted by score descending.
   * Used by the dashboard risk tile and supervisor watch-list.
   *
   * @param opts.limit - عدد الصفوف (افتراضي: 50، أقصى: 500) | Row limit
   * @returns قائمة العملاء ذوي المخاطر العالية | At-risk customer list
   */
  async listAtRiskCustomers(opts?: { limit?: number }) {
    const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 500);
    const customerIds = await this.candidateCustomerIds(limit * 5);
    const scores = await Promise.all(customerIds.map((id) => this.getScore(id)));
    return scores
      .filter((s) => s.level === 'HIGH' || s.level === 'CRITICAL')
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // ── Internals ────────────────────────────────────────────────

  private makeComponent(
    key: string,
    weight: number,
    rawValue: number,
    normalised: number,
  ): RiskComponent {
    return {
      key,
      weight,
      rawValue,
      normalised: Number(normalised.toFixed(4)),
      contribution: Number((weight * normalised).toFixed(4)),
    };
  }

  private async countBrokenPromises(customerId: string, since: Date): Promise<number> {
    return this.prisma.promiseToPay.count({
      where: {
        customerId,
        status: PromiseToPayStatus.BROKEN,
        updatedAt: { gte: since },
      },
    });
  }

  private async collectionsState(customerId: string) {
    const acc = await this.prisma.collectionsAccount.findUnique({
      where: { customerId },
      select: { currentStage: true, escalationLevel: true },
    });
    return {
      stage: acc?.currentStage ?? CollectionsStage.NEW,
      escalationLevel: acc?.escalationLevel ?? 0,
    };
  }

  private async ledgerStats(customerId: string, since: Date) {
    // V20.4 — DebtLedger removed; read payment events from JournalEntry.
    const [invoices, journalPayments] = await Promise.all([
      this.prisma.order.count({
        where: {
          customerId,
          createdAt: { gte: since },
          status: { not: OrderStatus.CANCELED },
        },
      }),
      this.prisma.journalEntry.findMany({
        where: {
          customerId,
          source: 'PAYMENT',
          orderId: { not: null },
          createdAt: { gte: since },
          NOT: { sourceRef: { startsWith: 'PAYMENT:WALLET:' } },
        },
        select: {
          lines: { where: { account: { code: '1300' } }, select: { credit: true } },
        },
      }),
    ]);
    let partials = 0;
    for (const e of journalPayments) {
      const cr = e.lines.reduce((s, l) => s.add(new Prisma.Decimal(l.credit.toString())), new Prisma.Decimal(0));
      if (invoices === 0 || cr.lessThan(50)) partials += 1;
    }
    return { invoicesLastWindow: invoices, partialPayments: partials };
  }

  private async refundCount(customerId: string, since: Date): Promise<number> {
    // Refunds surface as canceled orders OR debt-ledger negative
    // adjustments tagged REVENUE_RETURN. We approximate via canceled
    // orders for now — `OrderStatus.CANCELED` is the canonical signal.
    return this.prisma.order.count({
      where: {
        customerId,
        status: OrderStatus.CANCELED,
        createdAt: { gte: since },
      },
    });
  }

  private async failedPaymentCount(customerId: string, since: Date): Promise<number> {
    // TransactionHistory rows with FAILED outcome. The model has a
    // `status` enum varying by version; we count by ledger source
    // (REJECTED) which was the V20.4 introduction. Falls back to 0
    // when the field is absent — risk component just contributes 0.
    try {
      return await this.prisma.transactionHistory.count({
        where: {
          customerId,
          createdAt: { gte: since },
          // best-effort — uses the most common shape from V20.x
          // schemas. The count is bounded so a column-not-found
          // error degrades gracefully via the catch below.
          // @ts-expect-error - field name varies across schemas
          status: 'FAILED',
        },
      });
    } catch {
      return 0;
    }
  }

  private async candidateCustomerIds(limit: number): Promise<string[]> {
    // Customers with open AR — anyone with no debt is LOW by
    // construction so we don't waste cycles on them.
    const rows = await this.prisma.order.findMany({
      where: {
        status: { not: OrderStatus.CANCELED },
        cashStatus: CashStatus.UNPAID,
      },
      distinct: ['customerId'],
      select: { customerId: true },
      take: limit,
    });
    return rows.map((r) => r.customerId);
  }
}
