/**
 * CashExposureService — financial safety surface for the silent layer.
 *
 * Strict READ-ONLY aggregation that reuses the v2 analysis snapshot to
 * answer one question:
 *
 *   "Is any single driver carrying enough cash, for long enough, to
 *    deserve direct accountant / executive attention — even when the
 *    operational dashboard intentionally stays GREEN?"
 *
 * Output is consumed by:
 *   - GET /api/cash-intelligence/exposure       (accountant + executive)
 *   - executive.silentAlerts (embedded into the executive payload)
 *
 * MANAGER role is forbidden from this surface — see the controller's
 * @Roles guard. The frontend manager dashboard never imports this DTO.
 *
 * Thresholds (from the spec):
 *   - Amount     : ≥ 200 KD → WARNING, ≥ 500 KD → CRITICAL
 *   - Aging      : ≥ 24h → OVERDUE, ≥ 48h → HIGH_RISK, ≥ 72h → CRITICAL
 *   - Driver risk: max(amountRisk, ageRisk) per driver
 */
import { Injectable } from '@nestjs/common';
import { CashIntelligenceV2Service } from '../cash-intelligence/cash-intelligence-v2.service';
import {
  CashIntelligenceAnalysisDto,
  CashV2FlowDto,
} from '../cash-intelligence/dto/cash-intelligence-analysis.dto';
import {
  CashExposureResponseDto,
  ExposureAgingBucket,
  ExposureBatchDto,
  ExposureDriverDto,
  ExposureRiskLevel,
  ExposureSilentAlertDto,
  EXPOSURE_THRESHOLDS,
} from './dto/cash-exposure.dto';
import { CashClassifierService } from './cash-classifier.service';
import {
  buildDriverAmountMap,
  getDriverAmountKd,
  getDriverAmountStr,
  sumClassifiedKdLabel,
} from './driver-amount-map';

/**
 * Numeric ordering used to take `max(amountRisk, ageRisk)` without
 * relying on string comparisons.
 */
const RISK_ORDER: Record<ExposureRiskLevel, number> = {
  NORMAL: 0,
  WARNING: 1,
  HIGH_RISK: 2,
  CRITICAL: 3,
};

@Injectable()
export class CashExposureService {
  constructor(
    private readonly v2: CashIntelligenceV2Service,
    private readonly classifier: CashClassifierService,
  ) {}

  async computeExposure(): Promise<CashExposureResponseDto> {
    const analysis = await this.v2.runAnalysis({});
    return this.composeFromAnalysis(analysis);
  }

  /**
   * Pure projection from a v2 snapshot. Used both by the exposure
   * endpoint and by `CashExecutiveService` so the silent alerts stay
   * in sync with the executive view.
   *
   * SSoT: the WARNING / HIGH_RISK / CRITICAL amount thresholds
   * (200 / 500 KD) are evaluated against `classified.drivers[].amount`.
   * That guarantees a silent alert can never fire on a number the
   * dashboard does not also report. The batch / aging projection
   * continues to consume `analysis.flows` because that information
   * is not exposed by the classifier.
   */
  composeFromAnalysis(
    analysis: CashIntelligenceAnalysisDto,
  ): CashExposureResponseDto {
    const generatedAt = new Date().toISOString();
    const classified = this.classifier.composeFromAnalysis(analysis);
    const amountMap = buildDriverAmountMap(classified);

    // Group every live cash unit by driver. We only consider flows
    // whose stage hasn't reached BANK — anything settled in the bank
    // is no longer "exposure".
    type Group = {
      driverId: string;
      driverName: string | null;
      branchId: string | null;
      batches: ExposureBatchDto[];
      oldestAgeHours: number;
    };
    const byDriver = new Map<string, Group>();

    for (const f of analysis.flows) {
      if (f.stage === 'BANK') continue;
      const g = ensureGroup(byDriver, f);
      g.batches.push(toBatch(f));
      // NOTE: we intentionally do NOT accumulate g.totalKd here. The
      // SSoT exposure for the driver is read from the classifier
      // amount map below — that prevents the policy threshold from
      // ever firing on a number the dashboard doesn't show.
      if (f.ageHours > g.oldestAgeHours) {
        g.oldestAgeHours = f.ageHours;
      }
    }

    const drivers: ExposureDriverDto[] = [];
    const silentAlerts: ExposureSilentAlertDto[] = [];

    let driversAtWarning = 0;
    let driversAtHighRisk = 0;
    let driversAtCritical = 0;

    for (const g of byDriver.values()) {
      const totalKd = getDriverAmountKd(amountMap, g.driverId);
      const totalLabel = getDriverAmountStr(amountMap, g.driverId);
      const amountRiskLevel = classifyAmountRisk(totalKd);
      const ageRiskLevel = classifyAgeRisk(g.oldestAgeHours);
      const riskLevel = maxRisk(amountRiskLevel, ageRiskLevel);

      const driver: ExposureDriverDto = {
        driverId: g.driverId,
        driverName: g.driverName,
        branchId: g.branchId,
        totalExposure: totalLabel,
        batchCount: g.batches.length,
        oldestPendingAgeHours: round2(g.oldestAgeHours),
        amountRiskLevel,
        ageRiskLevel,
        riskLevel,
        // Sort batches oldest-first so the consumer can render the
        // most-aged unit at the top without resorting client-side.
        batches: g.batches
          .slice()
          .sort((a, b) => b.ageHours - a.ageHours),
      };
      drivers.push(driver);

      if (riskLevel === 'WARNING') driversAtWarning++;
      else if (riskLevel === 'HIGH_RISK') driversAtHighRisk++;
      else if (riskLevel === 'CRITICAL') driversAtCritical++;

      // Emit silent alerts for the actionable risk levels. Each driver
      // can produce at most one amount-based and one age-based alert
      // per snapshot — we never spam the silent feed.
      if (amountRiskLevel !== 'NORMAL') {
        silentAlerts.push({
          type: 'AMOUNT_THRESHOLD',
          level: amountRiskLevel,
          driverId: g.driverId,
          driverName: g.driverName,
          branchId: g.branchId,
          totalExposure: totalLabel,
          ageHours: null,
          message: amountAlertMessage_ar(g.driverName, totalKd, amountRiskLevel),
          generatedAt,
        });
      }
      if (ageRiskLevel !== 'NORMAL' && ageRiskLevel !== 'WARNING') {
        // Aging escalation: only HIGH_RISK and CRITICAL surface as
        // silent alerts. The simple OVERDUE band (≥24h) is reflected
        // in the batch bucket but never raises the silent feed alone.
        silentAlerts.push({
          type: 'AGING_THRESHOLD',
          level: ageRiskLevel,
          driverId: g.driverId,
          driverName: g.driverName,
          branchId: g.branchId,
          totalExposure: totalLabel,
          ageHours: round2(g.oldestAgeHours),
          message: ageAlertMessage_ar(g.driverName, g.oldestAgeHours, ageRiskLevel),
          generatedAt,
        });
      }
    }

    // Sort: most exposed drivers first; ties broken by oldest batch.
    drivers.sort((a, b) => {
      const da = parseFloat(a.totalExposure);
      const db = parseFloat(b.totalExposure);
      if (da !== db) return db - da;
      return b.oldestPendingAgeHours - a.oldestPendingAgeHours;
    });

    silentAlerts.sort((a, b) => RISK_ORDER[b.level] - RISK_ORDER[a.level]);

    return {
      generatedAt,
      summary: {
        totalDrivers: drivers.length,
        driversAtWarning,
        driversAtHighRisk,
        driversAtCritical,
        // SSoT: total exposure equals Σ classified.drivers[].amount.
        totalExposure: sumClassifiedKdLabel(classified),
      },
      drivers,
      silentAlerts,
      readOnly: true,
      advisoryOnly: true,
      audience: 'ACCOUNTANT_AND_EXECUTIVE',
    };
  }
}

// ─── helpers ──────────────────────────────────────────────────────

type ExposureGroup = {
  driverId: string;
  driverName: string | null;
  branchId: string | null;
  batches: ExposureBatchDto[];
  oldestAgeHours: number;
};

function ensureGroup(
  map: Map<string, ExposureGroup>,
  f: CashV2FlowDto,
): ExposureGroup {
  let g = map.get(f.driverId);
  if (!g) {
    g = {
      driverId: f.driverId,
      driverName: f.driverName,
      branchId: f.branchId,
      batches: [],
      oldestAgeHours: 0,
    };
    map.set(f.driverId, g);
  }
  return g;
}

function toBatch(f: CashV2FlowDto): ExposureBatchDto {
  return {
    batchId: `${f.driverId}::${f.originDate}::${f.amount}`,
    amount: f.amount,
    originDate: f.originDate,
    ageHours: round2(f.ageHours),
    ageBucket: bucketForAge(f.ageHours),
    stage: f.stage,
  };
}

function bucketForAge(ageHours: number): ExposureAgingBucket {
  const t = EXPOSURE_THRESHOLDS.ageHours;
  if (ageHours >= t.critical) return 'CRITICAL';
  if (ageHours >= t.highRisk) return 'HIGH_RISK';
  if (ageHours >= t.overdue) return 'OVERDUE';
  return 'PENDING';
}

function classifyAmountRisk(totalKd: number): ExposureRiskLevel {
  const a = EXPOSURE_THRESHOLDS.amount;
  if (totalKd >= a.criticalKd) return 'CRITICAL';
  if (totalKd >= a.warningKd) return 'WARNING';
  return 'NORMAL';
}

function classifyAgeRisk(oldestAgeHours: number): ExposureRiskLevel {
  const t = EXPOSURE_THRESHOLDS.ageHours;
  if (oldestAgeHours >= t.critical) return 'CRITICAL';
  if (oldestAgeHours >= t.highRisk) return 'HIGH_RISK';
  if (oldestAgeHours >= t.overdue) return 'WARNING';
  return 'NORMAL';
}

function maxRisk(a: ExposureRiskLevel, b: ExposureRiskLevel): ExposureRiskLevel {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function kdLabel(n: number): string {
  return n.toFixed(4);
}

function amountAlertMessage_ar(
  name: string | null,
  totalKd: number,
  level: ExposureRiskLevel,
): string {
  const who = name ?? 'سائق';
  const amount = totalKd.toFixed(3);
  if (level === 'CRITICAL') {
    return `انكشاف نقدي حرج: ${who} يحمل ${amount} د.ك (يتجاوز 500 د.ك).`;
  }
  return `انكشاف نقدي مرتفع: ${who} يحمل ${amount} د.ك (يتجاوز 200 د.ك).`;
}

function ageAlertMessage_ar(
  name: string | null,
  ageHours: number,
  level: ExposureRiskLevel,
): string {
  const who = name ?? 'سائق';
  const days = (ageHours / 24).toFixed(1);
  if (level === 'CRITICAL') {
    return `نقد متراكم منذ أكثر من 72 ساعة: ${who} لديه دفعة عمرها ${days} يوم.`;
  }
  return `نقد قديم بحاجة متابعة: ${who} لديه دفعة عمرها ${days} يوم.`;
}
