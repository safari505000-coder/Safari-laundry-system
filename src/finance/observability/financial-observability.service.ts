import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReconciliationService } from '../reconciliation/reconciliation.service';

/**
 * V20.6 — Phase 3 Financial Observability Service.
 *
 * Single read-only aggregator over every operational health signal
 * the V20.4/V20.5 surface produces:
 *
 *   • ReconciliationService           — 4 invariants, drift count
 *   • FraudAlert                      — OPEN by severity (V20.5 Phase 8)
 *   • FinancialPeriodViolation        — count + recent rows (V20.5 Phase 5 / V20.6 Phase 1)
 *   • JournalFailureLog               — failed safe-mirror attempts
 *   • FinancialSnapshot               — staleness percentile (lag minutes)
 *   • PromiseToPay                    — ACTIVE / BROKEN / KEPT counts (V20.5 Phase 2)
 *   • CollectionsAccount              — escalated / overdue-SLA counts (V20.5 Phase 3)
 *   • CriticalJournalFailureError     — circuit-breaker trips
 *
 * Every read uses Prisma `count` / `aggregate` / lightweight `findMany`
 * — never a full table scan. Time windows are bounded (default
 * rolling 24h). The service NEVER writes.
 *
 * Health score is a deterministic 0..100 derived from the signal
 * vector. Same inputs ⇒ same score (idempotent).
 */

export type ObservabilitySeverity =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'WARNING'
  | 'CRITICAL';

export type ObservabilitySection = {
  key: string;
  label: string;
  status: ObservabilitySeverity;
  metric: number | string;
  detail?: string;
};

export type ObservabilityOverview = {
  generatedAt: string;
  windowHours: number;
  healthScore: number; // 0..100, higher is healthier
  status: ObservabilitySeverity;
  sections: ObservabilitySection[];
};

export type ObservabilityDrift = {
  generatedAt: string;
  reconciliationOk: boolean;
  drift: Array<{
    invariant: string;
    expectedKd: string;
    actualKd: string;
    deltaKd: string;
    detail?: string;
  }>;
  periodViolations: number;
  recentViolations: Array<{
    id: string;
    writerName: string;
    sourceRef: string | null;
    attemptedAt: string;
  }>;
};

export type ObservabilityReconciliation = {
  generatedAt: string;
  durationMs: number;
  ok: boolean;
  driftCount: number;
  rows: Array<{
    invariant: string;
    expectedKd: string;
    actualKd: string;
    deltaKd: string;
    ok: boolean;
    detail?: string;
  }>;
};

export type ObservabilityPerformance = {
  generatedAt: string;
  windowHours: number;
  snapshot: {
    rows: number;
    stalePctOver10min: number;
    stalePctOver1hour: number;
    oldestLagMinutes: number;
  };
  journalFailures: {
    total: number;
    last24h: number;
    distinctCustomers24h: number;
  };
  fraudAlerts: {
    open: number;
    last24h: number;
    bySeverity: Record<string, number>;
  };
  promises: {
    active: number;
    brokenLast24h: number;
    keptLast24h: number;
  };
  collections: {
    escalated: number;
    overdueSla: number;
  };
};

const WINDOW_HOURS_DEFAULT = 24;
const SNAPSHOT_STALE_MIN = 10;
const SNAPSHOT_VERY_STALE_MIN = 60;

@Injectable()
export class FinancialObservabilityService {
  private readonly logger = new Logger(FinancialObservabilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  /**
   * High-level overview — one row per operational dimension. Wraps
   * `runOnce()` of the reconciliation engine plus lightweight counts
   * for fraud / snapshot / promises / collections / journal failures.
   *
   * The composite `healthScore` is a deterministic weighted average:
   *   reconciliation:    35%
   *   fraud alerts:      15%
   *   period violations: 10%
   *   snapshot lag:      15%
   *   journal failures:  15%
   *   collections SLA:   10%
   */
  async overview(windowHours = WINDOW_HOURS_DEFAULT): Promise<ObservabilityOverview> {
    const generatedAt = new Date().toISOString();
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const sections: ObservabilitySection[] = [];

    // 1) Reconciliation
    let reconciliationScore = 100;
    try {
      const recon = await this.reconciliation.runOnce();
      const failed = recon.rows.filter((r) => !r.ok).length;
      reconciliationScore = failed === 0 ? 100 : Math.max(0, 100 - failed * 25);
      sections.push({
        key: 'reconciliation',
        label: 'Financial Reconciliation',
        status: recon.ok ? 'HEALTHY' : failed >= 3 ? 'CRITICAL' : 'WARNING',
        metric: `${recon.driftCount} drift / ${recon.rows.length} invariants`,
        detail: recon.ok
          ? 'all invariants holding'
          : recon.rows
              .filter((r) => !r.ok)
              .map((r) => `${r.invariant}=${r.deltaKd}`)
              .join(' | '),
      });
    } catch (err) {
      reconciliationScore = 50;
      sections.push({
        key: 'reconciliation',
        label: 'Financial Reconciliation',
        status: 'DEGRADED',
        metric: 'unavailable',
        detail: (err as Error).message,
      });
    }

    // 2) Fraud alerts (OPEN)
    let fraudScore = 100;
    try {
      const open = await this.tryCount('fraudAlert', { status: 'OPEN' });
      const critical = await this.tryCount('fraudAlert', {
        status: 'OPEN',
        severity: 'CRITICAL',
      });
      fraudScore =
        critical > 0 ? 50 : open > 10 ? 70 : open > 0 ? 85 : 100;
      sections.push({
        key: 'fraud',
        label: 'Open Fraud Alerts',
        status:
          critical > 0
            ? 'CRITICAL'
            : open > 10
            ? 'WARNING'
            : open > 0
            ? 'DEGRADED'
            : 'HEALTHY',
        metric: open,
        detail: critical > 0 ? `${critical} CRITICAL` : undefined,
      });
    } catch {
      sections.push({
        key: 'fraud',
        label: 'Open Fraud Alerts',
        status: 'DEGRADED',
        metric: 'unavailable',
      });
    }

    // 3) Period violations (last 24h)
    let periodScore = 100;
    try {
      const violations = await this.tryCount('financialPeriodViolation', {
        attemptedAt: { gte: since },
      });
      periodScore = violations === 0 ? 100 : violations < 5 ? 85 : 60;
      sections.push({
        key: 'period_lock',
        label: 'Period-Lock Violations (24h)',
        status:
          violations === 0
            ? 'HEALTHY'
            : violations < 5
            ? 'DEGRADED'
            : 'WARNING',
        metric: violations,
      });
    } catch {
      sections.push({
        key: 'period_lock',
        label: 'Period-Lock Violations (24h)',
        status: 'DEGRADED',
        metric: 'unavailable',
      });
    }

    // 4) Snapshot lag
    let snapshotScore = 100;
    try {
      const lag = await this.snapshotLag();
      snapshotScore =
        lag.oldestLagMinutes >= SNAPSHOT_VERY_STALE_MIN
          ? 60
          : lag.oldestLagMinutes >= SNAPSHOT_STALE_MIN
          ? 85
          : 100;
      sections.push({
        key: 'snapshot_lag',
        label: 'Snapshot Lag',
        status:
          lag.oldestLagMinutes >= SNAPSHOT_VERY_STALE_MIN
            ? 'WARNING'
            : lag.oldestLagMinutes >= SNAPSHOT_STALE_MIN
            ? 'DEGRADED'
            : 'HEALTHY',
        metric: `${lag.oldestLagMinutes}min`,
        detail: `${lag.stalePctOver10min.toFixed(1)}% rows >10min, ${lag.stalePctOver1hour.toFixed(1)}% >1h`,
      });
    } catch {
      sections.push({
        key: 'snapshot_lag',
        label: 'Snapshot Lag',
        status: 'DEGRADED',
        metric: 'unavailable',
      });
    }

    // 5) Journal write failures (24h) — circuit-breaker proxy
    let journalScore = 100;
    try {
      const failures24h = await this.tryCount('journalFailureLog', {
        createdAt: { gte: since },
      });
      journalScore = failures24h === 0 ? 100 : failures24h < 5 ? 80 : 50;
      sections.push({
        key: 'journal_failures',
        label: 'Journal Write Failures (24h)',
        status:
          failures24h === 0
            ? 'HEALTHY'
            : failures24h < 5
            ? 'DEGRADED'
            : 'CRITICAL',
        metric: failures24h,
      });
    } catch {
      sections.push({
        key: 'journal_failures',
        label: 'Journal Write Failures (24h)',
        status: 'DEGRADED',
        metric: 'unavailable',
      });
    }

    // 6) Collections SLA
    let collectionsScore = 100;
    try {
      const overdueSla = await this.tryCount('collectionsAccount', {
        nextActionDueAt: { lt: new Date() },
      });
      collectionsScore =
        overdueSla === 0 ? 100 : overdueSla < 10 ? 90 : 75;
      sections.push({
        key: 'collections_sla',
        label: 'Collections SLA Overdue',
        status:
          overdueSla === 0
            ? 'HEALTHY'
            : overdueSla < 10
            ? 'DEGRADED'
            : 'WARNING',
        metric: overdueSla,
      });
    } catch {
      sections.push({
        key: 'collections_sla',
        label: 'Collections SLA Overdue',
        status: 'DEGRADED',
        metric: 'unavailable',
      });
    }

    const healthScore = Math.round(
      reconciliationScore * 0.35 +
        fraudScore * 0.15 +
        periodScore * 0.1 +
        snapshotScore * 0.15 +
        journalScore * 0.15 +
        collectionsScore * 0.1,
    );
    const status: ObservabilitySeverity =
      healthScore >= 95
        ? 'HEALTHY'
        : healthScore >= 80
        ? 'DEGRADED'
        : healthScore >= 60
        ? 'WARNING'
        : 'CRITICAL';

    return {
      generatedAt,
      windowHours,
      healthScore,
      status,
      sections,
    };
  }

  async drift(windowHours = WINDOW_HOURS_DEFAULT): Promise<ObservabilityDrift> {
    const generatedAt = new Date().toISOString();
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    let reconciliationOk = true;
    let drift: ObservabilityDrift['drift'] = [];
    try {
      const recon = await this.reconciliation.runOnce();
      reconciliationOk = recon.ok;
      drift = recon.rows
        .filter((r) => !r.ok)
        .map((r) => ({
          invariant: r.invariant,
          expectedKd: r.expectedKd,
          actualKd: r.actualKd,
          deltaKd: r.deltaKd,
          detail: r.detail,
        }));
    } catch (err) {
      reconciliationOk = false;
      drift.push({
        invariant: 'RECONCILIATION_UNAVAILABLE',
        expectedKd: '0.0000',
        actualKd: '0.0000',
        deltaKd: '0.0000',
        detail: (err as Error).message,
      });
    }
    let periodViolations = 0;
    let recentViolations: ObservabilityDrift['recentViolations'] = [];
    try {
      const rows = await this.prisma.financialPeriodViolation.findMany({
        where: { attemptedAt: { gte: since } },
        orderBy: { attemptedAt: 'desc' },
        take: 25,
      });
      periodViolations = rows.length;
      recentViolations = rows.map((r) => ({
        id: r.id,
        writerName: r.writerName,
        sourceRef: r.sourceRef,
        attemptedAt: r.attemptedAt.toISOString(),
      }));
    } catch {
      // table absent / migration pending — ignore
    }
    return {
      generatedAt,
      reconciliationOk,
      drift,
      periodViolations,
      recentViolations,
    };
  }

  async reconciliationReport(): Promise<ObservabilityReconciliation> {
    const recon = await this.reconciliation.runOnce();
    return {
      generatedAt: recon.generatedAt,
      durationMs: recon.durationMs,
      ok: recon.ok,
      driftCount: recon.driftCount,
      rows: recon.rows.map((r) => ({
        invariant: r.invariant,
        expectedKd: r.expectedKd,
        actualKd: r.actualKd,
        deltaKd: r.deltaKd,
        ok: r.ok,
        detail: r.detail,
      })),
    };
  }

  async performance(windowHours = WINDOW_HOURS_DEFAULT): Promise<ObservabilityPerformance> {
    const generatedAt = new Date().toISOString();
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const lag = await this.snapshotLag().catch(() => ({
      rows: 0,
      stalePctOver10min: 0,
      stalePctOver1hour: 0,
      oldestLagMinutes: 0,
    }));

    const journalFailures = await Promise.all([
      this.tryCount('journalFailureLog', {}).catch(() => 0),
      this.tryCount('journalFailureLog', { createdAt: { gte: since } }).catch(
        () => 0,
      ),
      this.distinctCustomersJournalFailures(since).catch(() => 0),
    ]).then(([total, last24h, distinctCustomers24h]) => ({
      total,
      last24h,
      distinctCustomers24h,
    }));

    const fraudOpen = await this.tryCount('fraudAlert', { status: 'OPEN' }).catch(() => 0);
    const fraudLast24h = await this.tryCount('fraudAlert', {
      detectedAt: { gte: since },
    }).catch(() => 0);
    const fraudBySeverity = await this.tryGroupBy(
      'fraudAlert',
      'severity',
      { status: 'OPEN' },
    ).catch(() => ({}));

    const promises = await Promise.all([
      this.tryCount('promiseToPay', { status: 'ACTIVE' }).catch(() => 0),
      this.tryCount('promiseToPay', {
        status: 'BROKEN',
        updatedAt: { gte: since },
      }).catch(() => 0),
      this.tryCount('promiseToPay', {
        status: 'KEPT',
        updatedAt: { gte: since },
      }).catch(() => 0),
    ]).then(([active, brokenLast24h, keptLast24h]) => ({
      active,
      brokenLast24h,
      keptLast24h,
    }));

    const collections = await Promise.all([
      this.tryCount('collectionsAccount', {
        currentStage: { in: ['ESCALATED', 'LEGAL'] },
      }).catch(() => 0),
      this.tryCount('collectionsAccount', {
        nextActionDueAt: { lt: new Date() },
      }).catch(() => 0),
    ]).then(([escalated, overdueSla]) => ({ escalated, overdueSla }));

    return {
      generatedAt,
      windowHours,
      snapshot: lag,
      journalFailures,
      fraudAlerts: {
        open: fraudOpen,
        last24h: fraudLast24h,
        bySeverity: fraudBySeverity,
      },
      promises,
      collections,
    };
  }

  // -------- helpers --------

  private async snapshotLag(): Promise<{
    rows: number;
    stalePctOver10min: number;
    stalePctOver1hour: number;
    oldestLagMinutes: number;
  }> {
    const total = await this.prisma.financialSnapshot.count().catch(() => 0);
    if (total === 0) {
      return {
        rows: 0,
        stalePctOver10min: 0,
        stalePctOver1hour: 0,
        oldestLagMinutes: 0,
      };
    }
    const now = Date.now();
    const tenMin = new Date(now - 10 * 60 * 1000);
    const oneHour = new Date(now - 60 * 60 * 1000);
    const [over10, over1h, oldest] = await Promise.all([
      this.prisma.financialSnapshot
        .count({ where: { refreshedAt: { lt: tenMin } } })
        .catch(() => 0),
      this.prisma.financialSnapshot
        .count({ where: { refreshedAt: { lt: oneHour } } })
        .catch(() => 0),
      this.prisma.financialSnapshot
        .findFirst({ orderBy: { refreshedAt: 'asc' }, select: { refreshedAt: true } })
        .catch(() => null),
    ]);
    const oldestLagMs = oldest ? now - oldest.refreshedAt.getTime() : 0;
    return {
      rows: total,
      stalePctOver10min: total > 0 ? (over10 / total) * 100 : 0,
      stalePctOver1hour: total > 0 ? (over1h / total) * 100 : 0,
      oldestLagMinutes: Math.round(oldestLagMs / 60000),
    };
  }

  private async tryCount(model: string, where: any): Promise<number> {
    const delegate = (this.prisma as any)[model];
    if (!delegate || typeof delegate.count !== 'function') return 0;
    return delegate.count({ where });
  }

  private async tryGroupBy(
    model: string,
    field: string,
    where: any,
  ): Promise<Record<string, number>> {
    const delegate = (this.prisma as any)[model];
    if (!delegate || typeof delegate.groupBy !== 'function') return {};
    const rows = await delegate.groupBy({
      by: [field],
      where,
      _count: { _all: true },
    });
    const out: Record<string, number> = {};
    for (const r of rows) {
      out[String(r[field])] = r._count?._all ?? 0;
    }
    return out;
  }

  private async distinctCustomersJournalFailures(
    since: Date,
  ): Promise<number> {
    const delegate = (this.prisma as any).journalFailureLog;
    if (!delegate || typeof delegate.findMany !== 'function') return 0;
    const rows = await delegate.findMany({
      where: { createdAt: { gte: since }, customerId: { not: null } },
      select: { customerId: true },
      distinct: ['customerId'],
    });
    return rows.length;
  }
}
