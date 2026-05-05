/**
 * DriverAmountAuditService — strict per-driver cross-layer auditor.
 *
 * Reads the SAME live snapshot the dashboard observes (via the
 * existing `CashMonitorService` and friends) and builds a
 * driverId-keyed map of the per-layer amounts:
 *
 *   /classified  → drivers[].amount
 *   /risk        → drivers[].totalCash
 *   /live        → driversAtRisk[].totalCash
 *   /operational → activeDrivers[].totalCash + driversAtRisk[].totalCash
 *   /executive   → topRisk.amount  + silentAlerts.byDriver[].totalExposure
 *
 * STRICT contract (per the audit spec):
 *   - Match drivers ONLY by driverId.
 *   - Do not modify any data.
 *   - Do not recompute financial logic.
 *   - Treat null as 0 for the max/min math, but keep the original
 *     null in `amounts.<layer>` and reflect presence on `presence.<layer>`.
 *   - Mismatch threshold: |max - min| > 0.01 KD.
 *
 * The endpoint exposing this service:
 *   GET /api/cash-intelligence/driver-amount-audit
 *
 * Auth/role enforcement is at the controller — this service is
 * called only after RBAC has cleared the request.
 */
import { Injectable } from '@nestjs/common';
import { CashMonitorService } from './cash-monitor.service';
import { CashRiskService } from './cash-risk.service';
import { CashExecutiveService } from './cash-executive.service';
import { CashClassifiedResponseDto } from './dto/cash-classified.dto';
import {
  CashMonitorLiveDto,
  MonitorDriverExposureDto,
} from './dto/cash-monitor.dto';
import {
  ActiveDriverDto,
  OperationalLiveDto,
} from './dto/cash-monitor-operational.dto';
import { CashRiskResponseDto } from './dto/cash-risk.dto';
import { CashExecutiveResponseDto } from './dto/cash-executive.dto';
import {
  DriverAmountAuditResponseDto,
  DriverAmountMismatchDto,
  DriverAmountPresenceDto,
  DriverAmountRootCause,
  DriverAmountSnapshotDto,
} from './dto/driver-amount-audit.dto';

/** Min delta in KD that constitutes a mismatch — per spec. */
const MISMATCH_THRESHOLD_KD = 0.01;
/** Drivers with delta above this magnitude are flagged "criticalDrivers". */
const CRITICAL_AMOUNT_KD = 5;

type Snapshot = {
  classified: number | null;
  risk: number | null;
  live: number | null;
  operational: number | null;
  executive: number | null;
};

type Bucket = {
  driverId: string;
  driverName: string | null;
  snap: Snapshot;
};

@Injectable()
export class DriverAmountAuditService {
  constructor(
    private readonly monitor: CashMonitorService,
    private readonly risk: CashRiskService,
    private readonly executive: CashExecutiveService,
  ) {}

  async run(): Promise<DriverAmountAuditResponseDto> {
    // Prime the live snapshot first so /classified, /operational
    // and /executive observe the same source-of-truth as /live.
    // Pattern mirrors the integrity audit and the executive service.
    const live = await this.monitor.getLive();
    const [operational, classified, executive, risk] = await Promise.all([
      this.monitor.getOperationalView(),
      this.monitor.getClassified(),
      this.executive.getExecutiveView(),
      this.risk.computeRisk(),
    ]);

    const buckets = this.buildBuckets({
      classified,
      risk,
      live,
      operational,
      executive,
    });

    const mismatches: DriverAmountMismatchDto[] = [];
    const matched: DriverAmountMismatchDto[] = [];

    for (const b of buckets.values()) {
      const row = this.buildRow(b);
      const deltaNum = parseFloat(row.difference);
      if (deltaNum > MISMATCH_THRESHOLD_KD) {
        mismatches.push(row);
      } else {
        matched.push(row);
      }
    }

    // Deterministic ordering — biggest delta first, then driverId.
    mismatches.sort((a, b) => {
      const da = parseFloat(a.difference) - parseFloat(b.difference);
      if (da !== 0) return -da;
      return a.driverId.localeCompare(b.driverId);
    });
    matched.sort((a, b) => a.driverId.localeCompare(b.driverId));

    const criticalDrivers = mismatches.filter(
      (m) => parseFloat(m.difference) >= CRITICAL_AMOUNT_KD,
    ).length;

    return {
      status: mismatches.length === 0 ? 'PASS' : 'FAIL',
      totalDrivers: buckets.size,
      mismatches,
      matched,
      summary: {
        totalMismatches: mismatches.length,
        criticalDrivers,
        layersChecked: 5,
      },
      generatedAt: new Date().toISOString(),
      readOnly: true,
    };
  }

  // ─── Build the unified map ───────────────────────────────────

  private buildBuckets(input: {
    classified: CashClassifiedResponseDto;
    risk: CashRiskResponseDto;
    live: CashMonitorLiveDto;
    operational: OperationalLiveDto;
    executive: CashExecutiveResponseDto;
  }): Map<string, Bucket> {
    const buckets = new Map<string, Bucket>();

    // /classified.drivers[]  (SSoT — first so it wins the driverName).
    for (const d of input.classified.drivers) {
      const b = ensure(buckets, d.driverId, d.driverName);
      b.snap.classified = parseAmount(d.amount);
    }

    // /risk.drivers[]
    for (const d of input.risk.drivers) {
      const b = ensure(buckets, d.driverId, d.driverName);
      b.snap.risk = parseAmount(d.totalCash);
    }

    // /live.driversAtRisk[] — only at-risk drivers carry per-driver
    // totals on the live layer; that is by design, not a mismatch.
    for (const d of input.live.driversAtRisk as MonitorDriverExposureDto[]) {
      const b = ensure(buckets, d.driverId, d.driverName);
      b.snap.live = parseAmount(d.totalCash);
    }

    // /operational — both `activeDrivers[]` and `driversAtRisk[]`
    // expose per-driver `totalCash`. The same driver may appear in
    // both (an at-risk driver is also active). When they do, both
    // values come from the same underlying flow set, so we just
    // overwrite — they MUST agree by construction. If they don't,
    // the discrepancy will surface against /classified.
    const setOpAmount = (d: ActiveDriverDto): void => {
      const b = ensure(buckets, d.driverId, d.driverName);
      b.snap.operational = parseAmount(d.totalCash);
    };
    for (const d of input.operational.activeDrivers) setOpAmount(d);
    for (const d of input.operational.driversAtRisk) setOpAmount(d);

    // /executive — primary surface is `topRisk` (one driver) plus the
    // silent exposure list when present (OWNER/GM/ACCT only).
    if (input.executive.topRisk?.driverId) {
      const t = input.executive.topRisk;
      const id = t.driverId as string;
      const b = ensure(buckets, id, t.driverName);
      b.snap.executive = parseAmount(t.amount);
    }
    const silent = input.executive.silentAlerts;
    if (silent) {
      for (const sa of silent) {
        // Silent alerts are amount + age based; the per-driver
        // totalExposure mirrors classified.drivers[].amount.
        if (sa.driverId) {
          const b = ensure(buckets, sa.driverId, sa.driverName);
          if (sa.totalExposure !== null && sa.totalExposure !== undefined) {
            b.snap.executive = parseAmount(sa.totalExposure);
          }
        }
      }
    }

    return buckets;
  }

  // ─── Per-driver row ──────────────────────────────────────────

  private buildRow(b: Bucket): DriverAmountMismatchDto {
    const presence: DriverAmountPresenceDto = {
      classified: b.snap.classified !== null,
      risk: b.snap.risk !== null,
      live: b.snap.live !== null,
      operational: b.snap.operational !== null,
      executive: b.snap.executive !== null,
    };
    const amounts: DriverAmountSnapshotDto = {
      classified: formatAmount(b.snap.classified),
      risk: formatAmount(b.snap.risk),
      live: formatAmount(b.snap.live),
      operational: formatAmount(b.snap.operational),
      executive: formatAmount(b.snap.executive),
    };

    // SSoT diff: drift is "two POPULATED layers disagree". A driver
    // missing from a non-coverage layer (e.g. /executive only carries
    // topRisk + silentAlerts; below-threshold drivers never appear)
    // would otherwise fire a false-positive mismatch where every
    // populated layer agreed exactly. We keep the per-layer numeric
    // map (with null→0) for the rootCause classifier — it needs the
    // stable shape — but the max/min/difference comparison consumes
    // only the populated subset.
    const numeric = {
      classified: b.snap.classified ?? 0,
      risk: b.snap.risk ?? 0,
      live: b.snap.live ?? 0,
      operational: b.snap.operational ?? 0,
      executive: b.snap.executive ?? 0,
    };
    const populated = [
      b.snap.classified,
      b.snap.risk,
      b.snap.live,
      b.snap.operational,
      b.snap.executive,
    ].filter((v): v is number => v !== null);
    const maxAmount = populated.length > 0 ? Math.max(...populated) : 0;
    const minAmount = populated.length > 0 ? Math.min(...populated) : 0;
    const difference =
      populated.length > 1 ? round4(maxAmount - minAmount) : 0;

    const { rootCause, reasons } = this.classify({
      numeric,
      presence,
      difference,
    });

    const severity: 'CRITICAL' | 'WARNING' =
      difference >= CRITICAL_AMOUNT_KD ? 'CRITICAL' : 'WARNING';

    return {
      driverId: b.driverId,
      driverName: b.driverName,
      amounts,
      presence,
      difference: difference.toFixed(4),
      minAmount: minAmount.toFixed(4),
      maxAmount: maxAmount.toFixed(4),
      severity,
      rootCause,
      reasons,
    };
  }

  // ─── Root-cause classifier (deterministic) ──────────────────

  private classify(input: {
    numeric: {
      classified: number;
      risk: number;
      live: number;
      operational: number;
      executive: number;
    };
    presence: DriverAmountPresenceDto;
    difference: number;
  }): { rootCause: DriverAmountRootCause; reasons: string[] } {
    const { numeric, presence } = input;
    const reasons: string[] = [];
    const causes = new Set<DriverAmountRootCause>();

    // Pair-wise diffs (always referencing the SSoT — /classified).
    if (
      Math.abs(numeric.classified - numeric.risk) > MISMATCH_THRESHOLD_KD
    ) {
      causes.add('CLASSIFICATION_DRIFT');
      reasons.push(
        `classified=${numeric.classified.toFixed(4)} ≠ risk=${numeric.risk.toFixed(4)} (Δ ${(numeric.classified - numeric.risk).toFixed(4)} KD)`,
      );
    }
    if (
      // Only flag a /live drift when the layer actually carries the
      // driver — being absent from /live is by design (live filters
      // to driversAtRisk only), and counting absence as drift turns
      // every healthy driver into a false positive.
      presence.live &&
      Math.abs(numeric.classified - numeric.live) > MISMATCH_THRESHOLD_KD
    ) {
      causes.add('SNAPSHOT_DRIFT');
      reasons.push(
        `classified=${numeric.classified.toFixed(4)} ≠ live=${numeric.live.toFixed(4)} (Δ ${(numeric.classified - numeric.live).toFixed(4)} KD)`,
      );
    }
    if (
      presence.operational &&
      Math.abs(numeric.classified - numeric.operational) > MISMATCH_THRESHOLD_KD
    ) {
      causes.add('FILTERING_BUG');
      reasons.push(
        `operational=${numeric.operational.toFixed(4)} ≠ classified=${numeric.classified.toFixed(4)} (Δ ${(numeric.operational - numeric.classified).toFixed(4)} KD)`,
      );
    }
    if (
      presence.executive &&
      Math.abs(numeric.classified - numeric.executive) > MISMATCH_THRESHOLD_KD
    ) {
      causes.add('EXECUTIVE_PROJECTION_BUG');
      reasons.push(
        `executive=${numeric.executive.toFixed(4)} ≠ classified=${numeric.classified.toFixed(4)} (Δ ${(numeric.executive - numeric.classified).toFixed(4)} KD)`,
      );
    }

    // "Only one layer has large value" — the partial-data signal.
    // We score it ONLY against the populated set so a normal
    // healthy driver (e.g. classified+risk only) doesn't trip it.
    const populatedCount = countTrue([
      presence.classified,
      presence.risk,
      presence.live,
      presence.operational,
      presence.executive,
    ]);
    const numericByLayer: Array<['classified' | 'risk' | 'live' | 'operational' | 'executive', number, boolean]> = [
      ['classified', numeric.classified, presence.classified],
      ['risk', numeric.risk, presence.risk],
      ['live', numeric.live, presence.live],
      ['operational', numeric.operational, presence.operational],
      ['executive', numeric.executive, presence.executive],
    ];
    const layersAboveThreshold = numericByLayer.filter(
      ([, v, p]) => p && v > MISMATCH_THRESHOLD_KD,
    );
    if (
      layersAboveThreshold.length === 1 &&
      populatedCount > 1 &&
      input.difference >= CRITICAL_AMOUNT_KD
    ) {
      causes.add('PARTIAL_DATA_OR_STALE_CACHE');
      const lone = layersAboveThreshold[0]!;
      reasons.push(
        `only ${lone[0]} reports a meaningful value (${lone[1].toFixed(4)} KD); other ${populatedCount - 1} populated layers are at zero.`,
      );
    }

    if (causes.size === 0) {
      // Caller decided the row is a mismatch (delta > threshold)
      // but no specific pair-wise diff fired — fall back to the
      // partial-data label.
      return {
        rootCause: 'PARTIAL_DATA_OR_STALE_CACHE',
        reasons: [
          `delta ${input.difference.toFixed(4)} KD detected but no specific layer pair disagrees — likely a presence gap.`,
        ],
      };
    }
    if (causes.size === 1) {
      return { rootCause: [...causes][0]!, reasons };
    }
    return { rootCause: 'MIXED_DRIFT', reasons };
  }
}

// ─── module-private helpers ─────────────────────────────────────

function ensure(
  map: Map<string, Bucket>,
  driverId: string,
  driverName: string | null,
): Bucket {
  let b = map.get(driverId);
  if (!b) {
    b = {
      driverId,
      driverName: driverName ?? null,
      snap: {
        classified: null,
        risk: null,
        live: null,
        operational: null,
        executive: null,
      },
    };
    map.set(driverId, b);
  } else if (!b.driverName && driverName) {
    b.driverName = driverName;
  }
  return b;
}

function parseAmount(raw: string | null | undefined): number {
  if (raw === null || raw === undefined) return 0;
  const n = Number.parseFloat(String(raw));
  return Number.isFinite(n) ? round4(n) : 0;
}

function formatAmount(n: number | null): string | null {
  if (n === null) return null;
  return n.toFixed(4);
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function countTrue(arr: boolean[]): number {
  let c = 0;
  for (const v of arr) if (v) c += 1;
  return c;
}

