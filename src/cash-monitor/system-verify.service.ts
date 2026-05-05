/**
 * SystemVerifyService — STRICTLY READ-ONLY contract validator.
 *
 * Drives every cash-intelligence layer with synthesised, in-memory
 * `CashIntelligenceAnalysisDto` payloads (the same shape v2 emits
 * after a real Prisma read) and asserts that every layer agrees on
 * the system status the classifier produced.
 *
 * Why this is safe:
 *   • The synthetic analysis is built locally — `CashIntelligenceV2Service`
 *     is never invoked, so no Prisma reads/writes happen on the
 *     verification path.
 *   • All three downstream services expose pure, sync-or-deterministic
 *     `composeFromAnalysis` / `compose` projections. We feed them the
 *     synthesised payload and inspect the projected output.
 *   • Synthetic decisions ALWAYS carry `topRisk = null`, which short-
 *     circuits the only DB read in `CashExecutiveService.compose`
 *     (the execution-tracker lookup).
 *
 * Validated scenarios:
 *   A — 3 KD held by a driver for 2 hours → GREEN, no financial alerts.
 *   B — 600 KD stuck on a driver for 50 hours, severity CRITICAL on
 *       the v2 anomaly → RED, ≥1 financial alert.
 *
 * Output mirrors `SystemVerifyResponseDto`. Any mismatch (between
 * expected and observed, OR between the three layers' systemStatus)
 * is reported in `mismatches[]` and forces `status = 'FAIL'`.
 */
import { Injectable } from '@nestjs/common';
import {
  CashIntelligenceAnalysisDto,
  CashV2AnomalyDto,
  CashV2FlowDto,
} from '../cash-intelligence/dto/cash-intelligence-analysis.dto';
import { CashClassifierService } from './cash-classifier.service';
import { CashRiskService } from './cash-risk.service';
import { CashExecutiveService } from './cash-executive.service';
import { CashClassifiedResponseDto } from './dto/cash-classified.dto';
import { CashMonitorLiveDto } from './dto/cash-monitor.dto';
import { OperationalLiveDto } from './dto/cash-monitor-operational.dto';
import { CashDecisionsResponseDto } from './dto/cash-decision.dto';
import {
  SystemVerifyCheckDto,
  SystemVerifyResponseDto,
} from './dto/system-verify.dto';

type ScenarioName = 'A_small_young_cash' | 'B_large_aged_cash';

type Scenario = {
  name: ScenarioName;
  label: string;
  expected: 'GREEN' | 'YELLOW' | 'RED';
  expectFinancialAlerts: 'NONE' | 'AT_LEAST_ONE_CRITICAL';
  build: () => CashIntelligenceAnalysisDto;
};

@Injectable()
export class SystemVerifyService {
  constructor(
    private readonly classifier: CashClassifierService,
    private readonly risk: CashRiskService,
    private readonly executive: CashExecutiveService,
  ) {}

  async run(): Promise<SystemVerifyResponseDto> {
    const scenarios: Scenario[] = [
      {
        name: 'A_small_young_cash',
        label: 'A — 3 KD on driver, 2 hours old',
        expected: 'GREEN',
        expectFinancialAlerts: 'NONE',
        build: () => buildSmallYoungScenario(),
      },
      {
        name: 'B_large_aged_cash',
        label: 'B — 600 KD on driver, 50 hours old',
        expected: 'RED',
        expectFinancialAlerts: 'AT_LEAST_ONE_CRITICAL',
        build: () => buildLargeAgedScenario(),
      },
    ];

    const checks: SystemVerifyCheckDto[] = [];
    const mismatches: string[] = [];

    for (const s of scenarios) {
      const analysis = s.build();
      const classified = this.classifier.composeFromAnalysis(analysis);
      const risk = this.risk.composeFromAnalysis(
        analysis,
        classified,
        new Map<string, number>(),
      );
      // Synthesise empty upstream snapshots so the executive composer
      // produces a deterministic, branch-agnostic projection. With
      // `decisions.topRisk = null`, the executive layer skips its
      // tracker lookup entirely — no DB read. We pass the classified
      // cash total into the synthetic upstream snapshots so the
      // executive's SSoT cash-total assertion is satisfied (every
      // layer must report Σ classified.amount).
      const synthTotal = classified.drivers
        .reduce((s, d) => s + Number(d.amount), 0)
        .toFixed(4);
      const live = buildEmptyLiveSnapshot(classified.systemStatus, synthTotal);
      const operational = buildEmptyOperationalSnapshot(
        classified.systemStatus,
        synthTotal,
      );
      const decisions = buildEmptyDecisionsSnapshot(classified.systemStatus);
      const executive = await this.executive.compose(
        live,
        operational,
        decisions,
        classified,
        null,
      );

      const ok =
        classified.systemStatus === s.expected &&
        risk.systemStatus === classified.systemStatus &&
        executive.systemStatus === classified.systemStatus &&
        verifyFinancialAlerts(s.expectFinancialAlerts, classified);

      if (classified.systemStatus !== s.expected) {
        mismatches.push(
          `${s.label}: expected systemStatus=${s.expected}, got ${classified.systemStatus}`,
        );
      }
      if (risk.systemStatus !== classified.systemStatus) {
        mismatches.push(
          `${s.label}: /risk.systemStatus (${risk.systemStatus}) drifts from /classified (${classified.systemStatus})`,
        );
      }
      if (executive.systemStatus !== classified.systemStatus) {
        mismatches.push(
          `${s.label}: /executive.systemStatus (${executive.systemStatus}) drifts from /classified (${classified.systemStatus})`,
        );
      }
      if (!verifyFinancialAlerts(s.expectFinancialAlerts, classified)) {
        const got = classified.financialAlerts.length;
        const expectedDescription =
          s.expectFinancialAlerts === 'NONE'
            ? '0 financial alerts'
            : 'at least 1 CRITICAL financial alert';
        mismatches.push(
          `${s.label}: expected ${expectedDescription}, got ${got} (severities: ${classified.financialAlerts.map((a) => a.severity).join(', ') || 'none'})`,
        );
      }

      checks.push({
        scenario: s.label,
        expected: s.expected,
        classified: classified.systemStatus,
        risk: risk.systemStatus,
        executive: executive.systemStatus,
        financialAlerts: classified.financialAlerts.length,
        complianceAlerts: classified.complianceAlerts.length,
        ok,
      });
    }

    const status: SystemVerifyResponseDto['status'] =
      mismatches.length === 0 ? 'PASS' : 'FAIL';

    return {
      status,
      blocked: mismatches.length > 0,
      checks,
      mismatches,
      generatedAt: new Date().toISOString(),
      readOnly: true,
    };
  }
}

// ─── Scenario synthesis ─────────────────────────────────────────

function verifyFinancialAlerts(
  expectation: Scenario['expectFinancialAlerts'],
  classified: CashClassifiedResponseDto,
): boolean {
  if (expectation === 'NONE') {
    return classified.financialAlerts.length === 0;
  }
  return classified.financialAlerts.some((a) => a.severity === 'CRITICAL');
}

const SYNTH_DRIVER_ID = '00000000-0000-0000-0000-000000000001';
const SYNTH_BRANCH_ID = '00000000-0000-0000-0000-000000000010';

function buildSmallYoungScenario(): CashIntelligenceAnalysisDto {
  // 3 KD held by one driver for 2 hours. No anomalies — everything is
  // within the 24h grace window AND below the 5 KD floor, so the
  // classifier MUST emit zero financial alerts.
  const flow: CashV2FlowDto = {
    driverId: SYNTH_DRIVER_ID,
    driverName: 'SYNTH_DRIVER',
    branchId: SYNTH_BRANCH_ID,
    amount: '3.0000',
    amountTier: 'SMALL',
    originDate: kuwaitDayIso(),
    ageDays: 0,
    ageHours: 2,
    stage: 'DRIVER',
    driverGate: 'ACTIVE_FLOW',
    shiftStatus: 'OPEN',
    shiftDurationHours: 2,
    ignoredNonOperational: false,
    contextReason: 'synthetic verify scenario A',
  };
  return analysisFromFlows({ flows: [flow], anomalies: [] });
}

function buildLargeAgedScenario(): CashIntelligenceAnalysisDto {
  // 600 KD on driver for 50 hours, with a STUCK_AT_DRIVER anomaly the
  // upstream v2 engine would have raised at CRITICAL severity. The
  // classifier MUST keep it CRITICAL (amount ≥ 5 KD AND age ≥ 24h),
  // which forces systemStatus = RED across all three layers.
  const flow: CashV2FlowDto = {
    driverId: SYNTH_DRIVER_ID,
    driverName: 'SYNTH_DRIVER',
    branchId: SYNTH_BRANCH_ID,
    amount: '600.0000',
    amountTier: 'LARGE',
    originDate: kuwaitDayIso(-2),
    ageDays: 2,
    ageHours: 50,
    stage: 'DRIVER',
    driverGate: 'ACTIVE_FLOW',
    shiftStatus: 'OPEN',
    shiftDurationHours: 50,
    ignoredNonOperational: false,
    contextReason: 'synthetic verify scenario B',
  };
  const anomaly: CashV2AnomalyDto = {
    type: 'STUCK_AT_DRIVER',
    severity: 'CRITICAL',
    amount: '600.0000',
    amountTier: 'LARGE',
    ageDays: 2,
    stage: 'DRIVER',
    responsible: 'DRIVER',
    driverId: SYNTH_DRIVER_ID,
    branchId: SYNTH_BRANCH_ID,
    reason: '600 KD stuck on driver for 50h.',
    actionLocked: false,
    requiresManualReview: true,
  };
  return analysisFromFlows({ flows: [flow], anomalies: [anomaly] });
}

function analysisFromFlows(input: {
  flows: CashV2FlowDto[];
  anomalies: CashV2AnomalyDto[];
}): CashIntelligenceAnalysisDto {
  const totalCash = input.flows
    .reduce((s, f) => s + Number(f.amount), 0)
    .toFixed(4);
  return {
    executionSummary: {
      dataFetched: ['synthetic'],
      logicApplied: ['synthetic'],
      ignoredCases: [],
      assumptions: ['SystemVerifyService synthesised this analysis'],
      toleranceKd: '0.0100',
      shiftOverdueCapHours: 16,
      asOfDate: kuwaitDayIso(),
      generatedAt: new Date().toISOString(),
    },
    systemHealth: 'OK',
    summary: {
      totalCash,
      newCash: totalCash,
      agedCash: '0.0000',
      issues: input.anomalies.length,
    },
    locationSummary: { DRIVER: totalCash, CUSTODY: '0.0000', BANK: '0.0000' },
    flows: input.flows,
    anomalies: input.anomalies,
    finalAssessment: 'synthetic verification analysis',
    readOnly: true,
    advisoryOnly: true,
  };
}

// ─── Empty upstream snapshots for executive.compose() ───────────

function buildEmptyLiveSnapshot(
  systemStatus: 'GREEN' | 'YELLOW' | 'RED',
  totalCash: string,
): CashMonitorLiveDto {
  const ts = new Date().toISOString();
  return {
    timestamp: ts,
    lastPollAt: ts,
    lastPollAgeSeconds: 0,
    realtimeStatus: systemStatus,
    activeDrivers: 0,
    preRisk: [],
    alerts: [],
    driversAtRisk: [],
    locationSummary: { DRIVER: totalCash, CUSTODY: '0.0000', BANK: '0.0000' },
    summary: {
      totalCash,
      driversAtRisk: 0,
      activeAnomalies: 0,
      openShifts: 0,
    },
    readOnly: true,
    advisoryOnly: true,
  };
}

function buildEmptyOperationalSnapshot(
  systemStatus: 'GREEN' | 'YELLOW' | 'RED',
  totalCash: string,
): OperationalLiveDto {
  return {
    timestamp: new Date().toISOString(),
    realtimeStatus: systemStatus,
    activeDrivers: [],
    driversAtRisk: [],
    alerts: [],
    hidden: { staleDriversCount: 0, excludedAlertCount: 0, note: 'synthetic' },
    summary: {
      totalDriversShown: 0,
      totalCash,
      driversAtRisk: 0,
      activeAlerts: 0,
    },
    readOnly: true,
    advisoryOnly: true,
  };
}

function buildEmptyDecisionsSnapshot(
  systemStatus: 'GREEN' | 'YELLOW' | 'RED',
): CashDecisionsResponseDto {
  return {
    timestamp: new Date().toISOString(),
    realtimeStatus: systemStatus,
    // CRITICAL: keep this `null` so the executive composer never calls
    // the execution tracker (its only DB read on the synthetic path).
    topRisk: null,
    actions: [],
    summary: { critical: 0, warning: 0, info: 0, totalActions: 0 },
    readOnly: true,
    advisoryOnly: true,
  };
}

// ─── Local Asia/Kuwait day helper (matches the rest of the module) ──

function kuwaitDayIso(offsetDays = 0): string {
  const KUWAIT_OFFSET_MIN = 180;
  const DAY_MS = 86_400_000;
  const local = new Date(
    Date.now() + KUWAIT_OFFSET_MIN * 60_000 + offsetDays * DAY_MS,
  );
  return local.toISOString().slice(0, 10);
}
