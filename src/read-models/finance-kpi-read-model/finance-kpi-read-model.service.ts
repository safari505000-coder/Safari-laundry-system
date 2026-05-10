import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CollectionsReadModel } from '../collections-read-model/collections-read-model.service';

/**
 * V20.4 — Phase 4 materialised KPI tier.
 *
 * Pre-computes dashboard tiles into `FinancialKpiSnapshot`. The
 * dashboard NEVER scans `JournalLine` or `DebtLedgerEntry` live
 * — it reads the latest row by `(kpiKey, scope)` and renders.
 *
 * Refresh strategies:
 *   • Cron — every 5 minutes (see `FinancialKpiSnapshotCron`).
 *   • Event — domain events queue an incremental refresh for
 *     the affected scope (see `FinancialKpiListener`).
 */

const KPI_KEYS = {
  COLLECTIONS_SUMMARY: 'collections.summary',
  FINANCE_DASHBOARD: 'finance.dashboard',
  OVERDUE_AGING: 'overdue.aging',
  DEBT_BUCKET: 'debt.bucket',
} as const;

const TOL = new Prisma.Decimal('0.001');

@Injectable()
export class FinanceKpiReadModel {
  private readonly logger = new Logger(FinanceKpiReadModel.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly collections: CollectionsReadModel,
  ) {}

  /**
   * Public read accessor for the dashboard. Returns the latest
   * materialised payload — falls back to a live compute if no
   * row exists yet (cold-start) and writes the freshly-computed
   * payload back to the table.
   */
  async getKpi<T = unknown>(
    kpiKey: string,
    scope = 'global',
  ): Promise<{ payload: T; computedAt: string } | null> {
    const row = await this.prisma.financialKpiSnapshot.findUnique({
      where: { kpiKey_scope: { kpiKey, scope } },
    });
    if (row) {
      return {
        payload: row.payload as T,
        computedAt: row.computedAt.toISOString(),
      };
    }
    if (scope === 'global') {
      const fresh = await this.refreshOne(kpiKey, scope);
      return fresh
        ? { payload: fresh.payload as T, computedAt: fresh.computedAt.toISOString() }
        : null;
    }
    return null;
  }

  /**
   * Materialise one KPI for one scope. Scope today is always
   * `global`; the schema supports `branch:<id>` etc. when the
   * dashboard adds per-branch tiles.
   */
  async refreshOne(
    kpiKey: string,
    scope = 'global',
  ): Promise<{ payload: unknown; computedAt: Date } | null> {
    const payload = await this.computePayload(kpiKey);
    if (!payload) return null;
    const inputDigest = digestPayload(payload);
    const row = await this.prisma.financialKpiSnapshot.upsert({
      where: { kpiKey_scope: { kpiKey, scope } },
      create: {
        kpiKey,
        scope,
        payload: payload as Prisma.InputJsonValue,
        computedAt: new Date(),
        computedFor: new Date(),
        inputDigest,
      },
      update: {
        payload: payload as Prisma.InputJsonValue,
        computedAt: new Date(),
        computedFor: new Date(),
        inputDigest,
      },
    });
    return { payload, computedAt: row.computedAt };
  }

  async refreshAll(): Promise<{ refreshed: number; failed: number }> {
    let refreshed = 0;
    let failed = 0;
    for (const k of Object.values(KPI_KEYS)) {
      try {
        await this.refreshOne(k, 'global');
        refreshed += 1;
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[FINANCE_KPI_REFRESH_FAILED] kpiKey=${k} message=${message}`,
        );
      }
    }
    return { refreshed, failed };
  }

  // ── Computation strategies ────────────────────────────────────

  private async computePayload(kpiKey: string): Promise<unknown | null> {
    switch (kpiKey) {
      case KPI_KEYS.COLLECTIONS_SUMMARY:
        return this.collections.getKpi();
      case KPI_KEYS.FINANCE_DASHBOARD:
        return this.computeFinanceDashboard();
      case KPI_KEYS.OVERDUE_AGING:
        return this.computeOverdueAging();
      case KPI_KEYS.DEBT_BUCKET:
        return this.computeDebtBucket();
      default:
        return null;
    }
  }

  private async computeFinanceDashboard() {
    const agg = await this.prisma.financialSnapshot.aggregate({
      _sum: {
        remainingDebtKd: true,
        paidTotalKd: true,
        totalInvoicesKd: true,
        walletBalanceKd: true,
        walletLiabilityKd: true,
      },
      _count: { _all: true },
    });
    return {
      totalRemainingDebtKd: (agg._sum.remainingDebtKd ?? new Prisma.Decimal(0)).toFixed(4),
      totalPaidKd: (agg._sum.paidTotalKd ?? new Prisma.Decimal(0)).toFixed(4),
      totalInvoicedKd: (agg._sum.totalInvoicesKd ?? new Prisma.Decimal(0)).toFixed(4),
      totalWalletBalanceKd: (agg._sum.walletBalanceKd ?? new Prisma.Decimal(0)).toFixed(4),
      totalWalletLiabilityKd: (agg._sum.walletLiabilityKd ?? new Prisma.Decimal(0)).toFixed(4),
      customers: agg._count._all,
      generatedAt: new Date().toISOString(),
    };
  }

  private async computeOverdueAging() {
    const rows = await this.prisma.financialSnapshot.findMany({
      where: { remainingDebtKd: { gt: TOL } },
      select: {
        customerId: true,
        remainingDebtKd: true,
        overdueInvoicesCount: true,
        lastInvoiceAt: true,
      },
    });
    const buckets = {
      bucket0_30: { count: 0, amountKd: new Prisma.Decimal(0) },
      bucket31_60: { count: 0, amountKd: new Prisma.Decimal(0) },
      bucket61_90: { count: 0, amountKd: new Prisma.Decimal(0) },
      bucket90Plus: { count: 0, amountKd: new Prisma.Decimal(0) },
    };
    const now = Date.now();
    for (const r of rows) {
      const ageDays = r.lastInvoiceAt
        ? Math.floor(
            (now - r.lastInvoiceAt.getTime()) / (24 * 60 * 60 * 1000),
          )
        : 0;
      const target =
        ageDays <= 30
          ? buckets.bucket0_30
          : ageDays <= 60
            ? buckets.bucket31_60
            : ageDays <= 90
              ? buckets.bucket61_90
              : buckets.bucket90Plus;
      target.count += 1;
      target.amountKd = target.amountKd.plus(r.remainingDebtKd);
    }
    return {
      bucket0_30: {
        count: buckets.bucket0_30.count,
        amountKd: buckets.bucket0_30.amountKd.toFixed(4),
      },
      bucket31_60: {
        count: buckets.bucket31_60.count,
        amountKd: buckets.bucket31_60.amountKd.toFixed(4),
      },
      bucket61_90: {
        count: buckets.bucket61_90.count,
        amountKd: buckets.bucket61_90.amountKd.toFixed(4),
      },
      bucket90Plus: {
        count: buckets.bucket90Plus.count,
        amountKd: buckets.bucket90Plus.amountKd.toFixed(4),
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private async computeDebtBucket() {
    const rows = await this.prisma.financialSnapshot.findMany({
      where: { remainingDebtKd: { gt: TOL } },
      select: { remainingDebtKd: true },
    });
    const tiers = {
      under10: 0,
      between10and50: 0,
      between50and200: 0,
      over200: 0,
    };
    for (const r of rows) {
      const v = r.remainingDebtKd.toNumber();
      if (v < 10) tiers.under10 += 1;
      else if (v < 50) tiers.between10and50 += 1;
      else if (v < 200) tiers.between50and200 += 1;
      else tiers.over200 += 1;
    }
    return { ...tiers, generatedAt: new Date().toISOString() };
  }
}

function digestPayload(payload: unknown): string {
  // Same FNV-1a as CollectionsIntelligenceService — fast,
  // not crypto, used only to spot "same value computed twice".
  const repr = JSON.stringify(payload);
  let hash = 0x811c9dc5;
  for (let i = 0; i < repr.length; i += 1) {
    hash ^= repr.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return `fnv:${hash.toString(16).padStart(8, '0')}`;
}
