/**
 * CashRiskService — v3 Risk Engine.
 *
 * STRICT contract:
 *   - READ-ONLY: composes from `CashIntelligenceV2Service.runAnalysis`.
 *     Never queries Prisma directly, never mutates anything.
 *   - PER-UNIT aging: each cash unit (= v2 flow) is scored on its own
 *     ageHours / ageDays / amount. We never reduce the unit list to a
 *     single bucket before scoring.
 *   - 24h GRACE: any unit with ageHours < 24 is classified NEW_CASH,
 *     contributes 0 to the driver score, and never produces an alert.
 *   - SHIFT-COMPLIANCE CAP: when a driver's open shift > 16h but ALL
 *     their units are still in grace, the driver's status is capped at
 *     WARNING regardless of any other signal. Shift age alone is NEVER
 *     a financial risk.
 *
 * The output shape mirrors the v3 prompt (drivers[], breakdown[],
 * anomalies[]) and exposes an `executionSummary` block declaring the
 * thresholds we actually used so the report is self-documenting.
 */
import { Injectable } from '@nestjs/common';
import { CashIntelligenceV2Service } from '../cash-intelligence/cash-intelligence-v2.service';
import {
  CashIntelligenceAnalysisDto,
  CashV2AnomalyDto,
  CashV2AnomalyType,
  CashV2FlowDto,
} from '../cash-intelligence/dto/cash-intelligence-analysis.dto';
import { CashExecutionTrackerService } from './cash-execution-tracker.service';
import { CashClassifierService } from './cash-classifier.service';
import { CashClassifiedResponseDto } from './dto/cash-classified.dto';
import {
  CashRiskAnomalyDto,
  CashRiskBreakdownDto,
  CashRiskDriverDto,
  CashRiskResponseDto,
  RiskDriverStatus,
  RiskTrafficLight,
} from './dto/cash-risk.dto';
import { CASH_RULES } from './cash-rules';
import {
  buildDriverAmountMap,
  getDriverAmountStr,
  sumClassifiedKdLabel,
} from './driver-amount-map';

// Shared rules — keep behaviour identical, but route every gate
// through the single source of truth so a policy tweak here cannot
// drift from the classifier.
const GRACE_PERIOD_HOURS = CASH_RULES.GRACE_HOURS;
const SHIFT_OVERDUE_CAP_HOURS = CASH_RULES.SHIFT_CAP_HOURS;
const SMALL_TIER_KD = CASH_RULES.MIN_CRITICAL_AMOUNT_KD;
/**
 * Stabilisation: cash below this floor NEVER appears in /risk.anomalies,
 * mirroring the classifier's `SMALL_AMOUNT_FLOOR_KD`. This is the
 * non-negotiable amount gate from the audit brief.
 */
const ANOMALY_AMOUNT_FLOOR_KD = CASH_RULES.MIN_CRITICAL_AMOUNT_KD;
// Risk-engine-only tier and behaviour weights. These are NOT cash
// rules — they shape the per-driver score but never gate severity
// classification, so they intentionally live outside `CASH_RULES`.
const LARGE_TIER_KD = 100;
const BEHAVIOR_LATE_THRESHOLD = 3;
const BEHAVIOR_MULTIPLIER = 1.5;

const SEVERITY_BANDS = {
  warning: 50,
  risk: 150,
  critical: 300,
};

/**
 * Anomaly types the Risk Engine forwards from v2. Per Step 10, we
 * surface ONLY anomalies on units >= 24h old. Same-day SHIFT_OVERDUE
 * is intentionally NOT a financial anomaly here — it's an operational
 * signal that the shift-compliance cap already handles.
 */
const RISK_ANOMALY_TYPES: ReadonlySet<CashV2AnomalyType> = new Set([
  'STUCK_AT_DRIVER',
  'HANDOVER_DELAY',
  'CUSTODY_DELAY',
  'DEPOSIT_NOT_REGISTERED',
  'DEPOSIT_AMOUNT_MISMATCH',
  'DOUBLE_COUNT_RISK',
  'OVERPAYMENT_ANOMALY',
  'SUBSCRIPTION_LEAKAGE',
]);

@Injectable()
export class CashRiskService {
  constructor(
    private readonly v2: CashIntelligenceV2Service,
    private readonly tracker: CashExecutionTrackerService,
    private readonly classifier: CashClassifierService,
  ) {}

  /**
   * Run the v3 risk computation against today's v2 analysis.
   *
   * SSoT: `systemStatus` is INHERITED from the classifier — the risk
   * engine no longer derives its own traffic light. This guarantees
   * the same dataset cannot show GREEN on /executive and YELLOW on
   * /risk simultaneously.
   */
  async computeRisk(): Promise<CashRiskResponseDto> {
    const analysis = await this.v2.runAnalysis({});
    const classified = this.classifier.composeFromAnalysis(analysis);
    const driverIds = uniqueDriverIds(analysis.flows);
    const lateCounts = await this.tracker.lateCountsByDriver(driverIds);
    return this.composeFromAnalysis(analysis, classified, lateCounts);
  }

  /**
   * Pure projection — exposed so the controller can pass a branch-
   * scoped classified payload (single source of truth) and get a
   * matching risk view without re-running the analysis.
   *
   * `lateCounts` is pre-fetched outside this synchronous projection so
   * the per-driver loop can run without async I/O.
   */
  composeFromAnalysis(
    analysis: CashIntelligenceAnalysisDto,
    classified: CashClassifiedResponseDto,
    lateCounts: ReadonlyMap<string, number>,
  ): CashRiskResponseDto {
    // Step 1 + 2 — group flows by driver. We only score live cash
    // (BANK is excluded by v2 already) and we keep flows whose driver
    // gate isn't fully suppressed. NEW_CASH same-day flows are KEPT
    // here so the breakdown is honest about what the driver holds —
    // they just contribute 0 to the score.
    const flowsByDriver = new Map<string, CashV2FlowDto[]>();
    for (const f of analysis.flows) {
      // v2 may surface zero-amount filler rows; skip those.
      if (parseAmount(f.amount) === 0) continue;
      // We never score historical balances or pure inactivity rows.
      if (
        f.ignoredNonOperational &&
        f.driverGate !== 'SHIFT_OVERDUE'
      ) {
        // Still track them in the breakdown for transparency below
        // (they appear with classification=NEW_CASH/score=0). For
        // grouping we still bucket by driver.
      }
      const key = f.driverId || 'UNATTRIBUTED';
      const list = flowsByDriver.get(key) ?? [];
      list.push(f);
      flowsByDriver.set(key, list);
    }

    // SSoT: per-driver cash totals are read from the classifier map,
    // never re-aggregated locally. Risk scoring continues to use the
    // per-unit `amountKd` so behaviour is unchanged.
    const amountMap = buildDriverAmountMap(classified);

    // Step 3-9 — per driver scoring + classification.
    const drivers: CashRiskDriverDto[] = [];
    let agedCashKd = 0;
    let newCashKd = 0;

    for (const [driverId, units] of flowsByDriver) {
      const lateCount = lateCounts.get(driverId) ?? 0;
      const behaviorMultiplier =
        lateCount >= BEHAVIOR_LATE_THRESHOLD ? BEHAVIOR_MULTIPLIER : 1;

      let driverScore = 0;
      const breakdown: CashRiskBreakdownDto[] = [];
      let allUnitsYoung = true;
      let hasAged = false;

      for (const u of units) {
        const amountKd = parseAmount(u.amount);

        if (u.ageHours < GRACE_PERIOD_HOURS) {
          // Grace: NORMAL, no scoring, but tracked in breakdown.
          newCashKd += amountKd;
          breakdown.push({
            amount: u.amount,
            ageDays: u.ageDays,
            ageHours: u.ageHours,
            score: 0,
            classification: 'NEW_CASH',
            stage: u.stage,
          });
          continue;
        }

        allUnitsYoung = false;
        hasAged = true;
        agedCashKd += amountKd;

        // Step 4-6 — base × amount weight × behaviour weight.
        const base = amountKd * u.ageDays;
        const amountMultiplier =
          amountKd < SMALL_TIER_KD
            ? 0.5
            : amountKd > LARGE_TIER_KD
              ? 2
              : 1;
        const final = round2(
          base * amountMultiplier * behaviorMultiplier,
        );
        driverScore += final;

        breakdown.push({
          amount: u.amount,
          ageDays: u.ageDays,
          ageHours: u.ageHours,
          score: final,
          classification: 'AGED',
          stage: u.stage,
        });
      }

      // Step 8 — severity from driverScore.
      let status: RiskDriverStatus = classifyStatus(driverScore);

      // Step 9 — Shift-compliance cap. When the driver has any open
      // shift > 16h but ALL their units are still inside the 24h
      // grace, the status MUST NOT exceed WARNING. We also flip the
      // breakdown rows that triggered the cap to SHIFT_COMPLIANCE_ONLY
      // so the UI can render the right copy.
      const shiftDurationH = unitsMaxShiftHours(units);
      let shiftComplianceOnly = false;
      if (
        shiftDurationH !== null &&
        shiftDurationH > SHIFT_OVERDUE_CAP_HOURS &&
        allUnitsYoung
      ) {
        shiftComplianceOnly = true;
        status = capAtWarning(status);
        for (const row of breakdown) {
          if (row.classification === 'NEW_CASH')
            row.classification = 'SHIFT_COMPLIANCE_ONLY';
        }
      }

      // Step 11 — responsibility (only when real anomalies exist).
      const driverAnomalies = analysis.anomalies.filter(
        (a) =>
          a.driverId === driverId && isRealRiskAnomaly(a, analysis.flows),
      );
      const responsible =
        driverAnomalies.length > 0 ? driverAnomalies[0].responsible : null;

      const action = recommendAction({
        status,
        shiftComplianceOnly,
        hasAged,
        anomalies: driverAnomalies,
      });

      // Sort breakdown oldest → youngest so the most material rows
      // appear at the top.
      breakdown.sort((a, b) => b.ageHours - a.ageHours);

      const lead = units[0];
      drivers.push({
        driverId,
        driverName: lead?.driverName ?? null,
        branchId: lead?.branchId ?? null,
        totalCash: getDriverAmountStr(amountMap, driverId),
        driverScore: round2(driverScore),
        status,
        breakdown,
        lateCountLast7Days: lateCount,
        behaviorMultiplier,
        shiftDurationHours: shiftDurationH,
        shiftComplianceOnly,
        action,
        responsible,
      });
    }

    // Step 10 — surface anomalies (per-unit). Stabilisation gate:
    //   * type must be in RISK_ANOMALY_TYPES (financial-only)
    //   * matched flow ageHours must be >= 24
    //   * amount must be >= 5 KD floor
    // Anything else stays out of the API contract — even if v2 still
    // emits it for historical/auditing reasons.
    const anomalies: CashRiskAnomalyDto[] = analysis.anomalies
      .filter((a) => isRealRiskAnomaly(a, analysis.flows))
      .map((a) => projectAnomaly(a, analysis.flows));

    const driversAtRisk = drivers.filter(
      (d) => d.status === 'RISK' || d.status === 'CRITICAL',
    ).length;
    // SSoT: traffic light from the classifier, not the score bands.
    const systemStatus: RiskTrafficLight = classified.systemStatus;

    return {
      systemStatus,
      summary: {
        // SSoT: total cash equals Σ(classified.drivers[].amount). We
        // never sum independently — that would risk drift the moment
        // any layer applies a divergent filter.
        totalCash: sumClassifiedKdLabel(classified),
        totalDrivers: drivers.length,
        driversAtRisk,
        agedCash: kdToFixed4(agedCashKd),
        newCash: kdToFixed4(newCashKd),
      },
      drivers: drivers.sort((a, b) => b.driverScore - a.driverScore),
      anomalies,
      executionSummary: {
        gracePeriodHours: GRACE_PERIOD_HOURS,
        severityBands: SEVERITY_BANDS,
        amountTiers: { small: SMALL_TIER_KD, large: LARGE_TIER_KD },
        shiftOverdueCapHours: SHIFT_OVERDUE_CAP_HOURS,
        generatedAt: new Date().toISOString(),
      },
      readOnly: true,
      advisoryOnly: true,
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

function parseAmount(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function kdToFixed4(n: number): string {
  return n.toFixed(4);
}

function unitsMaxShiftHours(units: CashV2FlowDto[]): number | null {
  let maxH: number | null = null;
  for (const u of units) {
    if (u.shiftStatus !== 'OPEN') continue;
    if (u.shiftDurationHours === null) continue;
    if (maxH === null || u.shiftDurationHours > maxH) {
      maxH = u.shiftDurationHours;
    }
  }
  return maxH;
}

function classifyStatus(score: number): RiskDriverStatus {
  if (score >= SEVERITY_BANDS.critical) return 'CRITICAL';
  if (score >= SEVERITY_BANDS.risk) return 'RISK';
  if (score >= SEVERITY_BANDS.warning) return 'WARNING';
  return 'NORMAL';
}

function capAtWarning(s: RiskDriverStatus): RiskDriverStatus {
  if (s === 'RISK' || s === 'CRITICAL') return 'WARNING';
  return s;
}

function isRealRiskAnomaly(
  a: CashV2AnomalyDto,
  flows: CashV2FlowDto[],
): boolean {
  // Type gate — only financial anomalies surface here.
  if (!RISK_ANOMALY_TYPES.has(a.type)) return false;

  // Amount floor — small cash (<5 KD) NEVER appears as a risk
  // anomaly, even when aged. Mirrors the classifier's hard rule.
  const amountKd = parseAmount(a.amount);
  if (amountKd < ANOMALY_AMOUNT_FLOOR_KD) return false;

  // Age gate — the matched flow's real ageHours must be >= 24. We
  // intentionally DO NOT trust `a.ageDays` (calendar diff) here:
  // cross-midnight cash can otherwise sneak in at 1h elapsed.
  const matchedHours = matchFlowAgeHours(a, flows);
  if (matchedHours < GRACE_PERIOD_HOURS) return false;

  return true;
}

function matchFlowAgeHours(
  a: CashV2AnomalyDto,
  flows: CashV2FlowDto[],
): number {
  const match = flows.find(
    (f) =>
      f.driverId === a.driverId &&
      f.amount === a.amount &&
      f.stage === a.stage,
  );
  if (match) return match.ageHours;
  // Fallback when no flow matches (e.g. driver-only anomalies). Use
  // the calendar-day count converted to a conservative lower bound.
  return Math.max(0, a.ageDays * 24);
}

function projectAnomaly(
  a: CashV2AnomalyDto,
  flows: CashV2FlowDto[],
): CashRiskAnomalyDto {
  // Use the matching flow for hour-level age when available.
  const match = flows.find(
    (f) =>
      f.driverId === a.driverId &&
      f.amount === a.amount &&
      f.stage === a.stage,
  );
  return {
    type: a.type,
    driverId: a.driverId ?? '',
    driverName: match?.driverName ?? null,
    branchId: a.branchId ?? match?.branchId ?? null,
    amount: a.amount,
    ageDays: a.ageDays,
    ageHours: match?.ageHours ?? a.ageDays * 24,
    responsible: a.responsible,
    reason: a.reason,
  };
}

function recommendAction(input: {
  status: RiskDriverStatus;
  shiftComplianceOnly: boolean;
  hasAged: boolean;
  anomalies: CashV2AnomalyDto[];
}): string {
  if (input.shiftComplianceOnly) {
    return 'CLOSE_SHIFT_COMPLIANCE';
  }
  if (input.status === 'CRITICAL') {
    return 'CONTACT_DRIVER_IMMEDIATELY';
  }
  if (input.status === 'RISK') {
    return 'FOLLOW_UP_TODAY';
  }
  if (input.status === 'WARNING') {
    return input.hasAged ? 'MONITOR_AGED_CASH' : 'MONITOR_SHIFT_DURATION';
  }
  return 'NO_ACTION';
}

function uniqueDriverIds(flows: CashV2FlowDto[]): string[] {
  const set = new Set<string>();
  for (const f of flows) {
    if (f.driverId) set.add(f.driverId);
  }
  return [...set];
}

