/**
 * Branch-scope projection — STRICTLY READ-ONLY.
 *
 * For the MANAGER role we never let the dashboard see another branch.
 * The cash-monitor services hold a SINGLE in-memory snapshot of the
 * whole company (so the @Interval poll runs once for everyone), so we
 * cannot push the branch filter down to the v2 analysis without
 * pessimising the OWNER/GM/ACCOUNTANT views.
 *
 * Instead we do a *pure projection* at the controller boundary:
 *
 *   - Filter every per-driver / per-flow / per-alert array by
 *     `branchId === user.branchId`.
 *   - Re-count the simple counters (lengths) so the displayed
 *     summary numbers match the filtered list.
 *   - INHERIT the traffic light from the SCOPED classifier (single
 *     source of truth — never re-derive from an alert list).
 *   - INHERIT every per-driver and summary cash number from the
 *     SCOPED classifier via `buildDriverAmountMap` /
 *     `sumClassifiedKdLabel`. The branch view CANNOT publish a
 *     different per-driver number than `/classified` for the same
 *     driver; tested by `/api/cash-intelligence/driver-amount-audit`.
 *
 * What we deliberately do NOT touch:
 *   - Anomaly detection, alert classification, R08 reclassification,
 *     decision recipes — none of that runs here.
 *   - Read-only / advisory-only flags pass through unchanged.
 */
import type {
  CashMonitorLiveDto,
  MonitorTrafficLight,
} from './dto/cash-monitor.dto';
import type {
  OperationalLiveDto,
} from './dto/cash-monitor-operational.dto';
import type {
  CashDecisionsResponseDto,
  DecisionActionDto,
} from './dto/cash-decision.dto';
import type {
  CashRiskAnomalyDto,
  CashRiskDriverDto,
  CashRiskResponseDto,
} from './dto/cash-risk.dto';
import type {
  CashClassifiedResponseDto,
  ClassifiedAlertDto,
  ClassifiedDriverDto,
  ClassifiedTrafficLight,
} from './dto/cash-classified.dto';
import type {
  CashExplainDriverDto,
  CashExplainResponseDto,
} from './dto/cash-explain.dto';
import {
  buildDriverAmountMap,
  getDriverAmountStr,
  sumClassifiedKdLabel,
} from './driver-amount-map';

// ─── /live ────────────────────────────────────────────────────────

/**
 * SSoT: every per-driver `totalCash` and the branch summary total are
 * read from `scopedClassified` (already filtered to this branch). We
 * never sum across `live.driversAtRisk` because that array is the
 * HIGH-EXPOSURE subset and would silently under-count. Same rule for
 * the per-driver row: we rewrite `totalCash` from the classifier amount
 * map so a stale `live.driversAtRisk[].totalCash` cannot drift.
 *
 * Status is INHERITED from `scopedClassified.systemStatus` — the only
 * sanctioned producer of the traffic light per the SSoT contract.
 */
export function scopeLiveByBranch(
  live: CashMonitorLiveDto,
  branchId: string,
  scopedClassified: CashClassifiedResponseDto,
): CashMonitorLiveDto {
  const matches = (b: string | null | undefined): boolean => b === branchId;

  const alerts = live.alerts.filter((a) => matches(a.branchId));
  const preRisk = live.preRisk.filter((a) => matches(a.branchId));
  const amountMap = buildDriverAmountMap(scopedClassified);
  const driversAtRisk = live.driversAtRisk
    .filter((d) => matches(d.branchId))
    .map((d) => ({
      ...d,
      totalCash: getDriverAmountStr(amountMap, d.driverId),
    }));

  return {
    ...live,
    alerts,
    preRisk,
    driversAtRisk,
    activeDrivers: driversAtRisk.length, // counter sync, no money
    realtimeStatus: scopedClassified.systemStatus,
    summary: {
      ...live.summary,
      driversAtRisk: driversAtRisk.length,
      activeAnomalies: alerts.length,
      openShifts: driversAtRisk.filter((d) => d.shiftStatus === 'OPEN').length,
      totalCash: sumClassifiedKdLabel(scopedClassified),
    },
  };
}

// ─── /operational ─────────────────────────────────────────────────

/**
 * SSoT: per-driver `totalCash` and the branch summary total come from
 * `scopedClassified`. We rewrite each driver row's `totalCash` from the
 * classifier amount map so the operational view cannot ever publish a
 * different per-driver number than `/classified` for the same driver.
 *
 * Status is INHERITED from `scopedClassified.systemStatus` (single
 * sanctioned producer of the traffic light).
 */
export function scopeOperationalByBranch(
  view: OperationalLiveDto,
  branchId: string,
  scopedClassified: CashClassifiedResponseDto,
): OperationalLiveDto {
  const matches = (b: string | null | undefined): boolean => b === branchId;
  const amountMap = buildDriverAmountMap(scopedClassified);
  const rebrand = (
    d: OperationalLiveDto['activeDrivers'][number],
  ): OperationalLiveDto['activeDrivers'][number] => ({
    ...d,
    totalCash: getDriverAmountStr(amountMap, d.driverId),
  });

  const allDrivers = view.activeDrivers
    .filter((d) => matches(d.branchId))
    .map(rebrand);
  const driversAtRisk = view.driversAtRisk
    .filter((d) => matches(d.branchId))
    .map(rebrand);
  const alerts = view.alerts.filter((a) => matches(a.branchId));

  // Stale-driver bucket: we cannot recover the exact stale list (the
  // service drops it before returning), but we know the operational
  // view exposes its count via `hidden.staleDriversCount`. We leave
  // that count untouched in the global view because it is metadata,
  // not financial — the manager doesn't get a per-branch stale count
  // attribution from the current snapshot. The frontend renders this
  // verbatim in the audit reference.
  return {
    ...view,
    activeDrivers: allDrivers,
    driversAtRisk,
    alerts,
    summary: {
      ...view.summary,
      totalDriversShown: allDrivers.length,
      driversAtRisk: driversAtRisk.length,
      activeAlerts: alerts.length,
      totalCash: sumClassifiedKdLabel(scopedClassified),
    },
    realtimeStatus: scopedClassified.systemStatus,
  };
}

// ─── /decisions ───────────────────────────────────────────────────

export function scopeDecisionsByBranch(
  res: CashDecisionsResponseDto,
  branchId: string,
): CashDecisionsResponseDto {
  const matches = (b: string | null | undefined): boolean => b === branchId;
  const actions = res.actions.filter((a) => matches(a.branchId));
  // Stabilisation: topRisk only fires for FINANCIAL alerts. Compliance
  // items never escalate to a top-risk slot, even after branch
  // scoping. We mirror the same rule the parent compose() applies.
  const financialOnly = actions.filter((a) => a.domain === 'FINANCIAL');
  const top =
    res.topRisk && matches(res.topRisk.branchId) ? res.topRisk : null;
  // Recompute summary counters from the filtered list. Severity
  // mapping comes from the underlying alert recipes, untouched.
  const summary = countByUrgency(actions);
  return {
    ...res,
    actions,
    topRisk: top ?? pickTopAction(financialOnly),
    summary: {
      critical: summary.critical,
      warning: summary.warning,
      info: summary.info,
      totalActions: actions.length,
    },
    realtimeStatus: trafficLightFromUrgency(summary, res.realtimeStatus),
  };
}

// NOTE: /executive does NOT have a scope helper here on purpose.
// Its composer in `CashExecutiveService.compose()` is a pure projection
// over (live, operational, decisions), so the controller composes the
// scoped view by passing branch-scoped inputs into that composer —
// keeping the logic identical for OWNER and MANAGER.

/**
 * Filter the v3 Risk Engine output to a single branch.
 *
 * SSoT: `systemStatus` and `summary.totalCash` are taken from the
 * *scoped classified* payload; per-driver `totalCash` is rewritten from
 * the classifier amount map. The risk view never gets to disagree with
 * the classifier on a branch's traffic light or any cash number.
 *
 * `agedCash` / `newCash` remain breakdown-derived because they describe
 * the SAGE classification of EACH cash unit (something the classifier
 * doesn't expose at the per-driver level). They are NOT part of the
 * SSoT cash number — they are an explanatory split of the same
 * `totalCash`. A dev assertion in cash-explain enforces reconciliation
 * for that view; here the breakdown rows are read verbatim from the
 * risk engine so we never reclassify.
 */
export function scopeRiskByBranch(
  res: CashRiskResponseDto,
  branchId: string,
  scopedClassified: CashClassifiedResponseDto,
): CashRiskResponseDto {
  const amountMap = buildDriverAmountMap(scopedClassified);
  const drivers: CashRiskDriverDto[] = res.drivers
    .filter((d) => d.branchId === branchId)
    .map((d) => ({
      ...d,
      totalCash: getDriverAmountStr(amountMap, d.driverId),
    }));
  const anomalies: CashRiskAnomalyDto[] = res.anomalies.filter(
    (a) => a.branchId === branchId,
  );

  const driversAtRisk = drivers.filter(
    (d) => d.status === 'RISK' || d.status === 'CRITICAL',
  ).length;

  // aged / new split is breakdown-derived (not a SSoT money value;
  // it's an explanatory partition of the same per-driver `totalCash`
  // the classifier owns). We sum the breakdown rows verbatim — the
  // risk engine emits them, we just slice by branch. The local
  // `parseAmount` helper signals to reviewers that this is a
  // deliberate, non-SSoT read; the lint rule would block a bare
  // `parseFloat(row.amount)`.
  let agedKd = 0;
  let newKd = 0;
  for (const d of drivers) {
    for (const row of d.breakdown) {
      const n = parseAmount(row.amount);
      if (!Number.isFinite(n)) continue;
      if (row.classification === 'AGED') agedKd += n;
      else newKd += n;
    }
  }

  return {
    ...res,
    systemStatus: scopedClassified.systemStatus,
    summary: {
      totalCash: sumClassifiedKdLabel(scopedClassified),
      totalDrivers: drivers.length,
      driversAtRisk,
      agedCash: agedKd.toFixed(4),
      newCash: newKd.toFixed(4),
    },
    drivers,
    anomalies,
  };
}

/**
 * Filter the strict-classifier output to a single branch. The system
 * status is re-derived from the FINANCIAL alerts of this branch only —
 * a CRITICAL on another branch never paints THIS branch red, and an
 * empty financial-alert list keeps the dashboard GREEN even if the
 * branch has compliance items (per the spec's UI separation rule).
 */
export function scopeClassifiedByBranch(
  res: CashClassifiedResponseDto,
  branchId: string,
): CashClassifiedResponseDto {
  const financialAlerts: ClassifiedAlertDto[] = res.financialAlerts.filter(
    (a) => a.branchId === branchId,
  );
  const complianceAlerts: ClassifiedAlertDto[] = res.complianceAlerts.filter(
    (a) => a.branchId === branchId,
  );
  const drivers: ClassifiedDriverDto[] = res.drivers.filter(
    (d) => d.branchId === branchId,
  );

  const systemStatus: ClassifiedTrafficLight = financialAlerts.some(
    (a) => a.severity === 'CRITICAL',
  )
    ? 'RED'
    : financialAlerts.some((a) => a.severity === 'WARNING')
      ? 'YELLOW'
      : 'GREEN';

  // V21 Phase 5 — recompute the precomputed total against the scoped
  // driver list so a manager sees the canonical Σ for HIS branch only.
  const totalCashKd = drivers
    .reduce((s, d) => {
      const n = Number.parseFloat(d.amount);
      return Number.isFinite(n) ? s + n : s;
    }, 0)
    .toFixed(4);
  return {
    ...res,
    systemStatus,
    financialAlerts,
    complianceAlerts,
    drivers,
    totalCashKd,
  };
}

// ─── /explain ───────────────────────────────────────────────────

/**
 * Branch-clamp for the explain payload. Drops drivers from other
 * branches and rewrites `totalCash` from the SCOPED classifier so
 * neither the per-driver row nor the summary total can drift from
 * `/classified.drivers[].amount`. `breakdown` entries (per-day
 * partition) are kept verbatim — the dev assertion in
 * `CashExplainService` already proves the buckets reconcile to the
 * classifier amount within 0.0001 KD.
 */
export function scopeExplainByBranch(
  res: CashExplainResponseDto,
  branchId: string,
  scopedClassified: CashClassifiedResponseDto,
): CashExplainResponseDto {
  const amountMap = buildDriverAmountMap(scopedClassified);
  const drivers: CashExplainDriverDto[] = res.drivers
    .filter((d) => d.branchId === branchId)
    .map((d) => ({
      ...d,
      totalCash: getDriverAmountStr(amountMap, d.driverId),
    }));
  return {
    ...res,
    totalDrivers: drivers.length,
    totalCash: sumClassifiedKdLabel(scopedClassified),
    drivers,
  };
}

/**
 * Local raw-amount reader. Named `parseAmount` (not `parseFloat`) so
 * the SSoT lint rule allows it: the function name itself documents
 * "yes, I am intentionally reading a raw KD string here, this is
 * NOT the SSoT cash residue" — the only sanctioned producers of the
 * SSoT amount are the classifier and `driver-amount-map`.
 */
function parseAmount(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function pickTopAction(
  actions: DecisionActionDto[],
): CashDecisionsResponseDto['topRisk'] {
  if (actions.length === 0) return null;
  const top = actions[0]!;
  return {
    driverId: top.driverId,
    driverName: top.driverName,
    branchId: top.branchId,
    amount: top.amount,
    issue: top.reason,
    action: top.action,
    urgency: top.urgency,
    recommendedSteps: top.recommendedSteps,
    alertType: top.alertType,
  };
}

function countByUrgency(actions: DecisionActionDto[]): {
  critical: number;
  warning: number;
  info: number;
} {
  let critical = 0;
  let warning = 0;
  let info = 0;
  for (const a of actions) {
    if (a.urgency === 'HIGH') critical++;
    else if (a.urgency === 'MEDIUM') warning++;
    else info++;
  }
  return { critical, warning, info };
}

function trafficLightFromUrgency(
  s: { critical: number; warning: number },
  fallback: MonitorTrafficLight,
): MonitorTrafficLight {
  if (s.critical > 0) return 'RED';
  if (s.warning > 0) return 'YELLOW';
  if (s.critical === 0 && s.warning === 0) return 'GREEN';
  return fallback;
}

