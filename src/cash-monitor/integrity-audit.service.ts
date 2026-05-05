/**
 * IntegrityAuditService — STRICTLY READ-ONLY cross-layer auditor.
 *
 * Pulls every cash-intelligence layer the dashboard sees, in parallel,
 * and runs a fixed catalogue of consistency predicates over them. The
 * output is a structured PASS / FAIL report listing each violation
 * with its two source layers, expected/found values, and exact delta.
 *
 * READ-ONLY guarantees:
 *   • Calls only the high-level read methods on existing services
 *     (`monitor.getLive`, `monitor.getOperationalView`,
 *      `monitor.getClassified`, `decisions.getDecisions`,
 *      `executive.getExecutiveView`, `risk.computeRisk`).
 *   • Never invokes Prisma directly. Never queues a job. Never
 *     mutates state.
 *
 * SSoT contract:
 *   The classifier (`/classified`) is the single source of truth.
 *   Every other layer must agree with it on systemStatus, severity
 *   counts, and topRisk shape.
 *
 * Intent:
 *   This is a SAFETY LAYER — it does not implement business rules,
 *   it merely OBSERVES the rules already encoded in the classifier
 *   and verifies the downstream layers obey them.
 */
import { Injectable } from '@nestjs/common';
import { CashMonitorService } from './cash-monitor.service';
import { CashDecisionService } from './cash-decision.service';
import { CashExecutiveService } from './cash-executive.service';
import { CashRiskService } from './cash-risk.service';
import { CashClassifiedResponseDto } from './dto/cash-classified.dto';
import { CashDecisionsResponseDto } from './dto/cash-decision.dto';
import { CashExecutiveResponseDto } from './dto/cash-executive.dto';
import { CashMonitorLiveDto } from './dto/cash-monitor.dto';
import { OperationalLiveDto } from './dto/cash-monitor-operational.dto';
import { CashRiskResponseDto } from './dto/cash-risk.dto';
import {
  IntegrityAuditResponseDto,
  IntegrityIssueDto,
} from './dto/integrity-audit.dto';

const ANOMALY_AMOUNT_FLOOR_KD = 5;
const ANOMALY_AGE_GATE_HOURS = 24;
/**
 * Tolerance for cross-layer monetary comparisons. The classifier and
 * the live snapshot use the same v2 flows, so they should match to
 * the cent — but we leave a 0.0001 KD margin in case any layer
 * rounds independently.
 */
const TOTAL_CASH_TOLERANCE_KD = 0.0001;

@Injectable()
export class IntegrityAuditService {
  constructor(
    private readonly monitor: CashMonitorService,
    private readonly decisions: CashDecisionService,
    private readonly executive: CashExecutiveService,
    private readonly risk: CashRiskService,
  ) {}

  async run(): Promise<IntegrityAuditResponseDto> {
    // Sequence the live snapshot first so the rest of the layers all
    // observe the same `lastSnapshot`. This matches the executive
    // controller's pattern (avoids a race where /live wins the lazy
    // poll and the others see an empty state).
    const live = await this.monitor.getLive();
    const [operational, decisions, classified, executive, risk] =
      await Promise.all([
        this.monitor.getOperationalView(),
        this.decisions.getDecisions(),
        this.monitor.getClassified(),
        this.executive.getExecutiveView(),
        this.risk.computeRisk(),
      ]);

    const critical: IntegrityIssueDto[] = [];
    const warnings: IntegrityIssueDto[] = [];

    checkStatusConsistency({
      classified,
      risk,
      executive,
      live,
      operational,
      out: critical,
    });
    checkSeverityCounts({ classified, executive, out: critical });
    checkTopRiskConsistency({ classified, executive, out: critical });
    checkClassifierThresholds({ classified, out: critical });
    checkRiskAnomalyThresholds({ risk, out: critical });
    checkDriverReconciliation({ classified, risk, out: warnings });
    checkTotalCashReconciliation({
      classified,
      live,
      out: warnings,
    });
    checkAlertEdgeCases({ classified, executive, out: warnings });

    const status: IntegrityAuditResponseDto['status'] =
      critical.length === 0 ? 'PASS' : 'FAIL';

    return {
      status,
      blocked: critical.length > 0,
      criticalIssues: critical,
      warnings,
      summary: {
        driversChecked: classified.drivers.length,
        alertsChecked:
          classified.financialAlerts.length +
          classified.complianceAlerts.length,
        layersChecked: 5,
        mismatches: critical.length,
        warnings: warnings.length,
        generatedAt: new Date().toISOString(),
      },
      readOnly: true,
    };
  }
}

// ─── Check 1: status consistency across all 5 layers ────────────

function checkStatusConsistency(input: {
  classified: CashClassifiedResponseDto;
  risk: CashRiskResponseDto;
  executive: CashExecutiveResponseDto;
  live: CashMonitorLiveDto;
  operational: OperationalLiveDto;
  out: IntegrityIssueDto[];
}): void {
  const truth = input.classified.systemStatus;
  pushStatusMismatch(
    truth,
    input.risk.systemStatus,
    '/classified',
    '/risk',
    input.out,
  );
  pushStatusMismatch(
    truth,
    input.executive.systemStatus,
    '/classified',
    '/executive',
    input.out,
  );
  pushStatusMismatch(
    truth,
    input.live.realtimeStatus,
    '/classified',
    '/live',
    input.out,
  );
  pushStatusMismatch(
    truth,
    input.operational.realtimeStatus,
    '/classified',
    '/operational',
    input.out,
  );
}

function pushStatusMismatch(
  truth: string,
  observed: string,
  sourceA: string,
  sourceB: string,
  out: IntegrityIssueDto[],
): void {
  if (truth === observed) return;
  out.push({
    type: 'STATUS_DRIFT',
    severity: 'CRITICAL',
    driverId: null,
    driverName: null,
    expected: truth,
    found: observed,
    sourceA,
    sourceB,
    delta: null,
    message: `${sourceB}.systemStatus (${observed}) drifts from the classifier truth (${truth}).`,
  });
}

// ─── Check 2: executive severity counts mirror /classified ──────

function checkSeverityCounts(input: {
  classified: CashClassifiedResponseDto;
  executive: CashExecutiveResponseDto;
  out: IntegrityIssueDto[];
}): void {
  const expectedCritical = input.classified.financialAlerts.filter(
    (a) => a.severity === 'CRITICAL',
  ).length;
  const expectedWarning = input.classified.financialAlerts.filter(
    (a) => a.severity === 'WARNING',
  ).length;

  if (input.executive.summary.criticalAlerts !== expectedCritical) {
    input.out.push({
      type: 'CRITICAL_COUNT_MISMATCH',
      severity: 'CRITICAL',
      driverId: null,
      driverName: null,
      expected: String(expectedCritical),
      found: String(input.executive.summary.criticalAlerts),
      sourceA: '/classified',
      sourceB: '/executive.summary.criticalAlerts',
      delta: String(input.executive.summary.criticalAlerts - expectedCritical),
      message: `Executive critical-alert count (${input.executive.summary.criticalAlerts}) drifts from /classified (${expectedCritical}).`,
    });
  }
  if (input.executive.summary.warningAlerts !== expectedWarning) {
    input.out.push({
      type: 'WARNING_COUNT_MISMATCH',
      severity: 'CRITICAL',
      driverId: null,
      driverName: null,
      expected: String(expectedWarning),
      found: String(input.executive.summary.warningAlerts),
      sourceA: '/classified',
      sourceB: '/executive.summary.warningAlerts',
      delta: String(input.executive.summary.warningAlerts - expectedWarning),
      message: `Executive warning-alert count (${input.executive.summary.warningAlerts}) drifts from /classified (${expectedWarning}).`,
    });
  }
}

// ─── Check 3: topRisk consistency ───────────────────────────────

function checkTopRiskConsistency(input: {
  classified: CashClassifiedResponseDto;
  executive: CashExecutiveResponseDto;
  out: IntegrityIssueDto[];
}): void {
  const noFinancial = input.classified.financialAlerts.length === 0;
  const top = input.executive.topRisk;
  if (noFinancial && top !== null) {
    input.out.push({
      type: 'TOPRISK_INCONSISTENCY',
      severity: 'CRITICAL',
      driverId: top.driverId,
      driverName: top.driverName,
      expected: 'null',
      found: top.alertType ?? 'topRisk',
      sourceA: '/classified.financialAlerts (empty)',
      sourceB: '/executive.topRisk',
      delta: null,
      message: `Executive topRisk surfaced (${top.alertType}) but /classified has zero financial alerts.`,
    });
  }
  if (top && top.driverId) {
    const inClassified = input.classified.financialAlerts.some(
      (a) => a.driverId === top.driverId,
    );
    if (!inClassified) {
      input.out.push({
        type: 'TOPRISK_DRIVER_NOT_IN_CLASSIFIED',
        severity: 'CRITICAL',
        driverId: top.driverId,
        driverName: top.driverName,
        expected: 'driverId present in /classified.financialAlerts',
        found: 'absent',
        sourceA: '/classified.financialAlerts',
        sourceB: '/executive.topRisk',
        delta: null,
        message: `Executive topRisk references driver ${top.driverId} but no matching financial alert exists in /classified.`,
      });
    }
  }
}

// ─── Check 4: classifier output respects its own rules ──────────

function checkClassifierThresholds(input: {
  classified: CashClassifiedResponseDto;
  out: IntegrityIssueDto[];
}): void {
  for (const a of input.classified.financialAlerts) {
    const amountKd = Number.parseFloat(a.amount) || 0;
    // The SHIFT_OVERDUE_FINANCIAL alerts are emitted when shift > 16h
    // AND cash >= 24h AND amount >= 5 KD — the same gates apply but
    // we keep the conditional explicit for traceability.
    if (amountKd < ANOMALY_AMOUNT_FLOOR_KD) {
      input.out.push({
        type: 'AMOUNT_FLOOR_VIOLATION',
        severity: 'CRITICAL',
        driverId: a.driverId,
        driverName: a.driverName,
        expected: `amount >= ${ANOMALY_AMOUNT_FLOOR_KD} KD`,
        found: a.amount,
        sourceA: '/classified.financialAlerts',
        sourceB: null,
        delta: (amountKd - ANOMALY_AMOUNT_FLOOR_KD).toFixed(4),
        message: `Financial alert with amount ${a.amount} KD breaches the ${ANOMALY_AMOUNT_FLOOR_KD} KD floor (type=${a.type}).`,
      });
    }
    if (a.cashAgeHours < ANOMALY_AGE_GATE_HOURS) {
      input.out.push({
        type: 'AGE_GATE_VIOLATION',
        severity: 'CRITICAL',
        driverId: a.driverId,
        driverName: a.driverName,
        expected: `cashAgeHours >= ${ANOMALY_AGE_GATE_HOURS}`,
        found: String(a.cashAgeHours),
        sourceA: '/classified.financialAlerts',
        sourceB: null,
        delta: (a.cashAgeHours - ANOMALY_AGE_GATE_HOURS).toFixed(2),
        message: `Financial alert with age ${a.cashAgeHours}h breaches the 24h grace gate (type=${a.type}).`,
      });
    }
  }
}

// ─── Check 5: /risk.anomalies respect the same gates ────────────

function checkRiskAnomalyThresholds(input: {
  risk: CashRiskResponseDto;
  out: IntegrityIssueDto[];
}): void {
  for (const a of input.risk.anomalies) {
    const amountKd = Number.parseFloat(a.amount) || 0;
    if (amountKd < ANOMALY_AMOUNT_FLOOR_KD) {
      input.out.push({
        type: 'AMOUNT_FLOOR_VIOLATION',
        severity: 'CRITICAL',
        driverId: a.driverId,
        driverName: a.driverName,
        expected: `amount >= ${ANOMALY_AMOUNT_FLOOR_KD} KD`,
        found: a.amount,
        sourceA: '/risk.anomalies',
        sourceB: null,
        delta: (amountKd - ANOMALY_AMOUNT_FLOOR_KD).toFixed(4),
        message: `Risk anomaly with amount ${a.amount} KD breaches the ${ANOMALY_AMOUNT_FLOOR_KD} KD floor (type=${a.type}).`,
      });
    }
    if (a.ageHours < ANOMALY_AGE_GATE_HOURS) {
      input.out.push({
        type: 'AGE_GATE_VIOLATION',
        severity: 'CRITICAL',
        driverId: a.driverId,
        driverName: a.driverName,
        expected: `ageHours >= ${ANOMALY_AGE_GATE_HOURS}`,
        found: String(a.ageHours),
        sourceA: '/risk.anomalies',
        sourceB: null,
        delta: (a.ageHours - ANOMALY_AGE_GATE_HOURS).toFixed(2),
        message: `Risk anomaly with age ${a.ageHours}h breaches the 24h grace gate (type=${a.type}).`,
      });
    }
  }
}

// ─── Check 6: per-driver reconciliation between /classified & /risk ─

function checkDriverReconciliation(input: {
  classified: CashClassifiedResponseDto;
  risk: CashRiskResponseDto;
  out: IntegrityIssueDto[];
}): void {
  const classifiedById = new Map(
    input.classified.drivers.map((d) => [d.driverId, d]),
  );
  const riskById = new Map(input.risk.drivers.map((d) => [d.driverId, d]));

  // /classified ⊆ /risk: every driver with live cash in classified
  // should also surface in /risk (which is built from the same flows).
  for (const [driverId, cd] of classifiedById) {
    const rd = riskById.get(driverId);
    if (!rd) {
      input.out.push({
        type: 'DRIVER_LAYER_MISMATCH',
        severity: 'WARNING',
        driverId,
        driverName: cd.driverName,
        expected: 'present in /risk.drivers',
        found: 'absent',
        sourceA: '/classified.drivers',
        sourceB: '/risk.drivers',
        delta: null,
        message: `Driver ${cd.driverName ?? driverId} appears in /classified but not in /risk.`,
      });
      continue;
    }
    const cAmount = Number.parseFloat(cd.amount) || 0;
    const rAmount = Number.parseFloat(rd.totalCash) || 0;
    const delta = Math.abs(cAmount - rAmount);
    if (delta > TOTAL_CASH_TOLERANCE_KD) {
      input.out.push({
        type: 'DRIVER_AMOUNT_MISMATCH',
        severity: 'WARNING',
        driverId,
        driverName: cd.driverName ?? rd.driverName,
        expected: cd.amount,
        found: rd.totalCash,
        sourceA: '/classified.drivers',
        sourceB: '/risk.drivers',
        delta: delta.toFixed(4),
        message: `Driver ${cd.driverName ?? driverId} reports ${cd.amount} KD on /classified but ${rd.totalCash} KD on /risk (delta ${delta.toFixed(4)} KD).`,
      });
    }
  }

  // /risk ⊆ /classified: a driver in /risk that isn't in classified
  // means the classifier dropped them silently. Worth surfacing.
  for (const [driverId, rd] of riskById) {
    if (!classifiedById.has(driverId)) {
      input.out.push({
        type: 'DRIVER_LAYER_MISMATCH',
        severity: 'WARNING',
        driverId,
        driverName: rd.driverName,
        expected: 'present in /classified.drivers',
        found: 'absent',
        sourceA: '/risk.drivers',
        sourceB: '/classified.drivers',
        delta: null,
        message: `Driver ${rd.driverName ?? driverId} appears in /risk but not in /classified.`,
      });
    }
  }
}

// ─── Check 7: total cash drift between classified sum & live ────

function checkTotalCashReconciliation(input: {
  classified: CashClassifiedResponseDto;
  live: CashMonitorLiveDto;
  out: IntegrityIssueDto[];
}): void {
  const classifiedSum = input.classified.drivers.reduce(
    (s, d) => s + (Number.parseFloat(d.amount) || 0),
    0,
  );
  const liveTotal = Number.parseFloat(input.live.summary.totalCash) || 0;
  const delta = Math.abs(classifiedSum - liveTotal);
  if (delta > TOTAL_CASH_TOLERANCE_KD) {
    input.out.push({
      type: 'TOTAL_CASH_DRIFT',
      severity: 'WARNING',
      driverId: null,
      driverName: null,
      expected: classifiedSum.toFixed(4),
      found: liveTotal.toFixed(4),
      sourceA: '/classified (sum of drivers)',
      sourceB: '/live.summary.totalCash',
      delta: delta.toFixed(4),
      message: `Total cash drifts: /classified sums to ${classifiedSum.toFixed(4)} KD but /live reports ${liveTotal.toFixed(4)} KD (delta ${delta.toFixed(4)} KD).`,
    });
  }
}

// ─── Check 8: alert edge cases worth surfacing ──────────────────

function checkAlertEdgeCases(input: {
  classified: CashClassifiedResponseDto;
  executive: CashExecutiveResponseDto;
  out: IntegrityIssueDto[];
}): void {
  for (const a of input.classified.financialAlerts) {
    if (!a.driverId) {
      input.out.push({
        type: 'ALERT_WITHOUT_DRIVER',
        severity: 'WARNING',
        driverId: null,
        driverName: a.driverName,
        expected: 'driverId attached',
        found: 'null',
        sourceA: '/classified.financialAlerts',
        sourceB: null,
        delta: null,
        message: `Financial alert (type=${a.type}, amount=${a.amount} KD) has no driverId — cannot be assigned for follow-up.`,
      });
    }
  }
  for (const a of input.classified.complianceAlerts) {
    if (!a.driverId) {
      input.out.push({
        type: 'ALERT_WITHOUT_DRIVER',
        severity: 'WARNING',
        driverId: null,
        driverName: a.driverName,
        expected: 'driverId attached',
        found: 'null',
        sourceA: '/classified.complianceAlerts',
        sourceB: null,
        delta: null,
        message: `Compliance alert (type=${a.type}) has no driverId — operator cannot follow up.`,
      });
    }
  }
  // Quietly note when /executive carries silent alerts but no
  // financial alerts surface — this is allowed but useful context.
  // (Intentionally not pushed as it's a normal state transition.)
  void input.executive;
}
