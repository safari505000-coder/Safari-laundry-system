/**
 * CashExplainService — STRICTLY READ-ONLY, ADVISORY-ONLY.
 *
 * "What is in this driver's bag, broken down by the day the cash
 * was earned?" — that's the only question this service answers.
 *
 * Contract:
 *   - Reads the SAME `lastSnapshot` the classifier consumed. No
 *     extra Prisma calls, no v2 re-runs, no time-skew between layers.
 *   - Pure projection — same input snapshot → same output, every time.
 *   - Reuses the classifier's amount math (same KD fixed-4 strings,
 *     same flow filter: drop zero-amount filler rows).
 *   - Knows nothing about severity, aging gates, or thresholds. Those
 *     belong to the classifier; this layer only groups and sums.
 *
 * What it ADDS over `/classified`:
 *   - Per-day amount breakdown for each driver.
 *   - Oldest origin date + age in hours (handy for "why is the
 *     dashboard yellow?" follow-ups).
 *
 * What it does NOT do:
 *   - It does NOT reclassify, escalate, or warn.
 *   - It does NOT change `/classified.drivers[].amount`.
 *   - It does NOT introduce a new financial calculation.
 */
import { Injectable, Logger } from '@nestjs/common';
import { CashMonitorService } from './cash-monitor.service';
import { CashClassifierService } from './cash-classifier.service';
import {
  CashIntelligenceAnalysisDto,
  CashV2FlowDto,
} from '../cash-intelligence/dto/cash-intelligence-analysis.dto';
import {
  CashExplainBreakdownEntryDto,
  CashExplainDriverDto,
  CashExplainResponseDto,
} from './dto/cash-explain.dto';
import {
  buildDriverAmountMap,
  DriverAmountMap,
  getDriverAmountStr,
  sumClassifiedKdLabel,
} from './driver-amount-map';

const RECONCILIATION_TOLERANCE_KD = 0.0001;

@Injectable()
export class CashExplainService {
  private readonly logger = new Logger(CashExplainService.name);

  constructor(
    private readonly monitor: CashMonitorService,
    private readonly classifier: CashClassifierService,
  ) {}

  /**
   * Build the explain projection from the cached snapshot.
   *
   * Cold start: peek will trigger a single lazy poll, exactly like
   * `/classified` does. We never run v2 a second time on the
   * dashboard's request.
   */
  async getExplain(): Promise<CashExplainResponseDto> {
    const snapshot = await this.monitor.peekSnapshot();
    return this.composeFromAnalysis(snapshot);
  }

  /**
   * Pure projection — exposed so the controller can pass a branch-
   * scoped snapshot if a manager-scope endpoint adds that path
   * later. Today the controller scopes the response after the fact
   * because the snapshot is shared across all readers.
   */
  composeFromAnalysis(
    snapshot: CashIntelligenceAnalysisDto | null,
  ): CashExplainResponseDto {
    const now = new Date();
    if (!snapshot) {
      return {
        generatedAt: now.toISOString(),
        totalDrivers: 0,
        totalCash: '0.0000',
        drivers: [],
        readOnly: true,
        advisoryOnly: true,
      };
    }

    // SSoT: per-driver and total cash are read from the classifier.
    // The per-day breakdown remains a flow-level projection (it carries
    // information the classifier does not expose), and a dev-only
    // assertion enforces that the bucket sum reconciles back to the
    // classifier amount.
    const classified = this.classifier.composeFromAnalysis(snapshot);
    const amountMap = buildDriverAmountMap(classified);

    // Group flows by driver, dropping zero-amount filler the same way
    // the classifier does (so the buckets reconcile exactly).
    const flowsByDriver = new Map<string, CashV2FlowDto[]>();
    for (const f of snapshot.flows) {
      if (!f.driverId) continue;
      if (parseAmount(f.amount) <= 0) continue;
      const list = flowsByDriver.get(f.driverId) ?? [];
      list.push(f);
      flowsByDriver.set(f.driverId, list);
    }

    const drivers: CashExplainDriverDto[] = [];
    for (const [driverId, flows] of flowsByDriver) {
      const driver = composeDriver(driverId, flows, amountMap);
      drivers.push(driver);
      this.assertBucketReconciliation(driver);
    }

    // Stable presentation: largest exposure first, then driverId for
    // determinism. Drivers with identical exposure should never flip
    // order across requests.
    drivers.sort((a, b) => {
      const diff = parseAmount(b.totalCash) - parseAmount(a.totalCash);
      if (diff !== 0) return diff;
      return a.driverId.localeCompare(b.driverId);
    });

    return {
      generatedAt: now.toISOString(),
      totalDrivers: drivers.length,
      // SSoT: total = Σ classified.drivers[].amount.
      totalCash: sumClassifiedKdLabel(classified),
      drivers,
      readOnly: true,
      advisoryOnly: true,
    };
  }

  /**
   * Dev-only invariant: the sum of per-day breakdown amounts must
   * reconcile to the classifier's amount for the same driver within
   * 0.0001 KD. A drift here means the classifier and the explain
   * projection are reading divergent flow filters and the SSoT
   * contract is broken at the boundary.
   */
  private assertBucketReconciliation(driver: CashExplainDriverDto): void {
    const bucketSum = driver.breakdown.reduce(
      (s, b) => s + parseAmount(b.amount),
      0,
    );
    const driverTotal = parseAmount(driver.totalCash);
    const delta = Math.abs(bucketSum - driverTotal);
    if (delta <= RECONCILIATION_TOLERANCE_KD) return;

    const msg = `cash-explain bucket drift: driver=${driver.driverId} bucketSum=${bucketSum.toFixed(4)} classifiedAmount=${driverTotal.toFixed(4)} delta=${delta.toFixed(4)} KD`;
    this.logger.error(msg);
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(msg);
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────

function composeDriver(
  driverId: string,
  flows: CashV2FlowDto[],
  amountMap: DriverAmountMap,
): CashExplainDriverDto {
  // Per-day buckets keyed on the flow's Kuwait `originDate`. Buckets
  // remain a flow projection — they are not money values exposed at
  // the API top level, they are explanatory detail. The driver's
  // `totalCash` field is sourced from the classifier (SSoT).
  const buckets = new Map<string, { amount: number; count: number }>();
  let oldestAgeHours = 0;
  let oldestDate: string | null = null;

  for (const f of flows) {
    const amountKd = parseAmount(f.amount);

    const bucket = buckets.get(f.originDate) ?? { amount: 0, count: 0 };
    bucket.amount += amountKd;
    bucket.count += 1;
    buckets.set(f.originDate, bucket);

    if (f.ageHours > oldestAgeHours) {
      oldestAgeHours = f.ageHours;
      oldestDate = f.originDate;
    }
  }

  // Fallback for the oldest origin date: if every flow somehow
  // reports ageHours = 0 (highly unlikely outside synthetic data),
  // pick the chronologically earliest bucket key. Lexical sort works
  // because the format is YYYY-MM-DD.
  if (oldestDate === null && buckets.size > 0) {
    oldestDate = [...buckets.keys()].sort()[0];
  }

  const breakdown: CashExplainBreakdownEntryDto[] = [...buckets.entries()]
    .map(([date, b]) => ({
      date,
      amount: kdToFixed4(b.amount),
      count: b.count,
    }))
    // Oldest → newest so a UI reading top-to-bottom sees the cash that
    // has been waiting the longest first.
    .sort((a, b) => a.date.localeCompare(b.date));

  const lead = flows[0];
  return {
    driverId,
    driverName: lead?.driverName ?? null,
    branchId: lead?.branchId ?? null,
    // SSoT: read from the classifier amount map.
    totalCash: getDriverAmountStr(amountMap, driverId),
    oldestCashAgeHours: round2(oldestAgeHours),
    oldestOriginDate: oldestDate,
    flowCount: flows.length,
    breakdown,
  };
}

function parseAmount(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function kdToFixed4(n: number): string {
  return n.toFixed(4);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
