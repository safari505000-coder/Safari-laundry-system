/**
 * V21 — Phase 4: Period Lock Full Enforcement.
 *
 * Read-only monitor over `FinancialPeriod` + `FinancialPeriodViolation`.
 * Emits a structured health signal that can be:
 *
 *   • Surfaced to operators (lock-violation dashboard)
 *   • Fed into Prometheus / Grafana (period_lock_violations_recent_total)
 *   • Used by the period-integrity cron to alert on spikes
 *
 * Pure functions only — never mutates state. Safe to call from any
 * request handler, cron, or health probe.
 */

import { FinancialPeriodStatus } from '@prisma/client';

export interface PeriodHealthSnapshot {
  /** ISO timestamp at which the snapshot was computed. */
  at: string;
  /** Reflects whether the runtime guard is enforcing today. */
  enforcementMode: 'enforcing' | 'monitoring';
  /** Periods currently in CLOSED state. */
  closedPeriods: number;
  /** Periods marked OPEN explicitly (not the implicit OPEN default). */
  openPeriods: number;
  /** Total violation rows in the inspected window. */
  recentViolations: number;
  /**
   * Violations whose payload says `allowedAsReversal=true`. These were
   * permitted writes (operator opt-in via `allowReversal`). They are
   * still recorded for audit; not failures.
   */
  recentReversalViolations: number;
  /**
   * Violations that were rejected (i.e. the writer call threw because
   * the period was CLOSED and `allowReversal=false`). These are the
   * ones operators care about — every one is an attempted bypass.
   */
  recentRejectedViolations: number;
  /**
   * Per-writer breakdown of rejections. Operators use this to find
   * the source of the bypass attempts (e.g. a misconfigured cron).
   */
  rejectionsByWriter: Array<{ writerName: string; count: number }>;
  /** Health classification for alerting. */
  health: 'green' | 'amber' | 'red';
  /** Human-readable explanation of the health classification. */
  reason: string;
}

export interface PeriodHealthInput {
  /** `process.env.PERIOD_LOCK_ENFORCE === 'true'` at sample time. */
  enforcementMode: 'enforcing' | 'monitoring';
  periods: ReadonlyArray<{ status: FinancialPeriodStatus }>;
  violations: ReadonlyArray<{
    writerName: string;
    payload: unknown;
    attemptedAt: Date;
  }>;
  /** ISO timestamp at sample time. Defaulted via `new Date().toISOString()` if omitted. */
  at?: string;
  /** Threshold above which monitor goes amber/red. Defaults: 5/20. */
  thresholds?: { amber: number; red: number };
}

const DEFAULT_THRESHOLDS = { amber: 5, red: 20 } as const;

function isReversal(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null) return false;
  const v = (payload as { allowedAsReversal?: unknown }).allowedAsReversal;
  return v === true;
}

/**
 * Pure projection of period + violation data into a health snapshot.
 * No Prisma calls — the caller is expected to have already hydrated
 * the inputs (typically via `FinancialPeriodsService.list()` and
 * `FinancialPeriodsService.listViolations({ limit: 200 })`).
 */
export function projectPeriodHealth(
  input: PeriodHealthInput,
): PeriodHealthSnapshot {
  const at = input.at ?? new Date().toISOString();
  const thresholds = input.thresholds ?? DEFAULT_THRESHOLDS;

  let closed = 0;
  let open = 0;
  for (const p of input.periods) {
    if (p.status === FinancialPeriodStatus.CLOSED) closed += 1;
    else if (p.status === FinancialPeriodStatus.OPEN) open += 1;
  }

  let reversal = 0;
  let rejected = 0;
  const rejectionCounts = new Map<string, number>();
  for (const v of input.violations) {
    if (isReversal(v.payload)) {
      reversal += 1;
    } else {
      rejected += 1;
      rejectionCounts.set(v.writerName, (rejectionCounts.get(v.writerName) ?? 0) + 1);
    }
  }

  const rejectionsByWriter = Array.from(rejectionCounts.entries())
    .map(([writerName, count]) => ({ writerName, count }))
    .sort((a, b) => b.count - a.count);

  let health: PeriodHealthSnapshot['health'] = 'green';
  let reason = 'no rejected period-lock violations in the window';
  if (rejected >= thresholds.red) {
    health = 'red';
    reason = `${rejected} rejected period-lock writes in window (>= red threshold ${thresholds.red})`;
  } else if (rejected >= thresholds.amber) {
    health = 'amber';
    reason = `${rejected} rejected period-lock writes in window (>= amber threshold ${thresholds.amber})`;
  }
  if (input.enforcementMode === 'monitoring' && rejected + reversal > 0) {
    // Even in monitor mode, violations indicate operators ARE trying
    // to write into closed periods — flag amber so we know to flip
    // enforcement on once the source of the writes is fixed.
    if (health === 'green') {
      health = 'amber';
      reason = `monitor mode but ${reversal + rejected} period-lock violation(s) recorded`;
    }
  }

  return {
    at,
    enforcementMode: input.enforcementMode,
    closedPeriods: closed,
    openPeriods: open,
    recentViolations: input.violations.length,
    recentReversalViolations: reversal,
    recentRejectedViolations: rejected,
    rejectionsByWriter,
    health,
    reason,
  };
}
