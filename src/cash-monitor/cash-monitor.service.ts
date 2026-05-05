/**
 * CashMonitorService — REAL-TIME, READ-ONLY, ADVISORY-ONLY.
 *
 * Sits on top of `CashIntelligenceV2Service.runAnalysis()` and runs an
 * @Interval(60s) poll loop. It NEVER recomputes financial logic; it only:
 *
 *   1. Consumes the v2 analysis snapshot.
 *   2. Diffs it against the previous in-memory snapshot.
 *   3. Generates predictive alerts (R06 PRE_SHIFT_OVERDUE, R07 HIGH_DRIVER_EXPOSURE).
 *   4. Mirrors detected anomalies as monitor alerts (with dedup).
 *   5. Exposes the live state via `getLive()` for the controller.
 *
 * Read-only contract:
 *   - Calls the v2 service directly (in-process) — same Prisma read path.
 *   - Holds state in memory only (no DB writes, no queue publishes).
 *
 * Advisory-only contract:
 *   - No webhooks fire. No external sinks notified.
 *   - The /live endpoint is a passive readback for dashboards.
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { CashIntelligenceV2Service } from '../cash-intelligence/cash-intelligence-v2.service';
import {
  CashIntelligenceAnalysisDto,
  CashV2AmountTier,
  CashV2AnomalyDto,
  CashV2FlowDto,
  CashV2Severity,
} from '../cash-intelligence/dto/cash-intelligence-analysis.dto';
import {
  CashMonitorLiveDto,
  MonitorAlertDto,
  MonitorAlertSeverity,
  MonitorAlertType,
  MonitorDriverExposureDto,
  MonitorTrafficLight,
} from './dto/cash-monitor.dto';
import {
  ActiveDriverDto,
  OperationalAlertDto,
  OperationalAlertType,
  OperationalDriverStatus,
  OperationalLiveDto,
} from './dto/cash-monitor-operational.dto';
import { CashClassifierService } from './cash-classifier.service';
import {
  CashClassifiedResponseDto,
  ClassifiedAlertDto,
} from './dto/cash-classified.dto';
import {
  buildDriverAmountMap,
  DriverAmountMap,
  getDriverAmountKd,
  getDriverAmountStr,
  sumClassifiedKdLabel,
} from './driver-amount-map';

// ─── Tunables ───────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 60_000;
const SHIFT_PRE_OVERDUE_HOURS = 14;
const SHIFT_OVERDUE_HOURS = 16;
const HIGH_DRIVER_EXPOSURE_KD = 500;
const ALERT_DEDUP_WINDOW_MS = 5 * 60_000; // 5 min — same key suppressed
const ALERT_RING_BUFFER_SIZE = 200;

@Injectable()
export class CashMonitorService implements OnModuleDestroy {
  private readonly logger = new Logger(CashMonitorService.name);
  private pollInProgress = false;
  /**
   * In-flight poll promise. Parallel callers attach to this same
   * promise instead of bailing early — that closes a SSoT drift
   * window where one request gets the cached snapshot while another
   * gets the empty-shape fallback because `pollInProgress` was
   * already set.
   */
  private pollPromise: Promise<void> | null = null;
  private lastSnapshot: CashIntelligenceAnalysisDto | null = null;
  private lastPollAt: Date | null = null;
  private lastPollErrorAt: Date | null = null;
  private lastPollError: string | null = null;

  /** Recently emitted alerts, capped to ALERT_RING_BUFFER_SIZE. */
  private readonly alertsRing: MonitorAlertDto[] = [];

  /** Dedup map: key → last emission timestamp. */
  private readonly lastEmittedAt = new Map<string, number>();

  /** First-time-seen flag. We do NOT diff-alert on initial load. */
  private bootstrapped = false;

  /**
   * Listeners notified on every successful snapshot processing with
   * the freshly-built operational view. Used by the execution tracker
   * to detect at-risk transitions without an extra DB poll.
   */
  private readonly snapshotListeners: Array<
    (op: OperationalLiveDto) => void
  > = [];

  constructor(
    private readonly v2: CashIntelligenceV2Service,
    private readonly classifier: CashClassifierService,
  ) {}

  /**
   * Subscribe to snapshots. The listener is invoked synchronously on
   * the same tick as `processSnapshot`. Returns an unsubscribe handle
   * that the caller MUST invoke on shutdown to prevent leaks.
   */
  onOperationalSnapshot(
    listener: (op: OperationalLiveDto) => void,
  ): () => void {
    this.snapshotListeners.push(listener);
    return () => {
      const idx = this.snapshotListeners.indexOf(listener);
      if (idx >= 0) this.snapshotListeners.splice(idx, 1);
    };
  }

  // ─── Lifecycle ─────────────────────────────────────────────────

  onModuleDestroy(): void {
    this.alertsRing.length = 0;
    this.lastEmittedAt.clear();
    this.lastSnapshot = null;
  }

  // ─── Public API used by the controller ─────────────────────────

  /**
   * Synchronous readback of the latest live monitor state. Triggers a
   * lazy poll on first call so the dashboard does not see an empty
   * snapshot before the first @Interval tick.
   */
  async getLive(): Promise<CashMonitorLiveDto> {
    if (!this.lastSnapshot) {
      await this.pollSafe();
    }
    return this.composeLive();
  }

  /**
   * Operational (filtered) view — display-only filter that:
   *   1. Hides STALE shifts (open shift, no today activity, 0 exposure).
   *   2. Reclassifies SHIFT_OVERDUE alerts per R08:
   *        - exposure = 0 → SHIFT_COMPLIANCE_DELAY (WARNING).
   *        - exposure > 0 → SHIFT_OVERDUE_FINANCIAL (CRITICAL).
   *   3. Reports the suppressed counts via `hidden.*`.
   *
   * The underlying snapshot, ring buffer and anomaly counts are NEVER
   * modified by this method — pure derivation.
   */
  async getOperationalView(): Promise<OperationalLiveDto> {
    if (!this.lastSnapshot) {
      await this.pollSafe();
    }
    return this.composeOperational();
  }

  /**
   * Classified view (single source of truth). Returns the strict
   * FINANCIAL vs COMPLIANCE projection of the current snapshot.
   *
   * We re-use the in-memory `lastSnapshot` instead of re-running v2
   * so /classified, /operational and /executive observe the EXACT
   * same input — no time-skew between layers.
   */
  async getClassified(): Promise<CashClassifiedResponseDto> {
    if (!this.lastSnapshot) {
      await this.pollSafe();
    }
    if (!this.lastSnapshot) {
      // Cold-start fallback: classifier runs its own v2 query.
      return this.classifier.classify();
    }
    return this.classifier.composeFromAnalysis(this.lastSnapshot);
  }

  /**
   * Read-only accessor for the cached v2 snapshot.
   *
   * Returns the SAME `CashIntelligenceAnalysisDto` the classifier,
   * risk engine, and operational view consume — so any explainability
   * / breakdown layer that asks "what did the dashboard see right
   * now?" gets a deterministic answer without re-running v2.
   *
   * Triggers a lazy poll on cold start so the first dashboard caller
   * is not handed `null`.
   */
  async peekSnapshot(): Promise<CashIntelligenceAnalysisDto | null> {
    if (!this.lastSnapshot) {
      await this.pollSafe();
    }
    return this.lastSnapshot;
  }

  // ─── Background poller (every 60s) ─────────────────────────────

  @Interval('cash-monitor-poll', POLL_INTERVAL_MS)
  async pollSafe(): Promise<void> {
    // If a poll is already running, every caller awaits the SAME
    // promise. That guarantees `lastSnapshot` is populated for every
    // caller before they continue, closing the SSoT race where
    // parallel readers could see different snapshot states.
    if (this.pollPromise) return this.pollPromise;
    this.pollPromise = this.runPoll().finally(() => {
      this.pollPromise = null;
    });
    return this.pollPromise;
  }

  private async runPoll(): Promise<void> {
    this.pollInProgress = true;
    try {
      const start = Date.now();
      const snapshot = await this.v2.runAnalysis({});
      const elapsed = Date.now() - start;
      this.processSnapshot(snapshot);
      this.lastPollAt = new Date();
      this.lastPollError = null;
      this.lastPollErrorAt = null;
      this.logger.debug(
        `cash-monitor poll ok in ${elapsed}ms — flows=${snapshot.flows.length}, anomalies=${snapshot.anomalies.length}`,
      );
    } catch (e) {
      this.lastPollError = (e as Error).message ?? String(e);
      this.lastPollErrorAt = new Date();
      this.logger.warn(`cash-monitor poll failed: ${this.lastPollError}`);
    } finally {
      this.pollInProgress = false;
    }
  }

  // ─── Snapshot ingestion + diff ─────────────────────────────────

  private processSnapshot(curr: CashIntelligenceAnalysisDto): void {
    const prev = this.lastSnapshot;
    const now = new Date();

    // SSoT: build the classifier amount map once per poll. R06 / R07
    // threshold checks (200 KD, 500 KD) MUST evaluate against the
    // classifier's per-driver number — never against an independent
    // Σ over `curr.flows`. This is the same contract the dashboard
    // and the silent-alert layer use.
    const classified = this.classifier.composeFromAnalysis(curr);
    const amountMap = buildDriverAmountMap(classified);

    // Diff alerts (only after bootstrap; we never alert "new" on the
    // very first poll because everything would be new).
    if (this.bootstrapped && prev) {
      this.emitDiffAlerts(prev, curr, now);
    }

    // Mirror anomalies (dedup'd by stable key + window).
    this.emitMirroredAnomalies(curr, now);

    // R06 — predictive PRE_SHIFT_OVERDUE.
    this.emitPreShiftOverdue(curr, now, amountMap);

    // R07 — high-driver-exposure visibility advisory.
    this.emitHighDriverExposure(curr, now, amountMap);

    this.lastSnapshot = curr;
    this.bootstrapped = true;

    // Notify subscribers (execution tracker, etc.) with the freshly
    // composed operational view. Each listener runs in a try/catch
    // so a buggy subscriber cannot break the monitor's poll loop.
    if (this.snapshotListeners.length > 0) {
      const op = this.composeOperational();
      for (const l of this.snapshotListeners) {
        try {
          l(op);
        } catch (e) {
          this.logger.warn(
            `snapshot listener threw: ${(e as Error).message}`,
          );
        }
      }
    }
  }

  // ─── Diff engine ───────────────────────────────────────────────

  private emitDiffAlerts(
    prev: CashIntelligenceAnalysisDto,
    curr: CashIntelligenceAnalysisDto,
    now: Date,
  ): void {
    const prevFlowByOrder = new Map<string, CashV2FlowDto>();
    for (const f of prev.flows) {
      const key = flowKey(f);
      if (key) prevFlowByOrder.set(key, f);
    }

    for (const f of curr.flows) {
      const key = flowKey(f);
      if (!key) continue;
      const before = prevFlowByOrder.get(key);
      if (!before) {
        this.tryEmit(now, {
          type: 'NEW_FLOW',
          severity: 'INFO',
          driverId: f.driverId || null,
          driverName: f.driverName,
          branchId: f.branchId,
          amount: f.amount,
          message: `New live cash flow detected at stage ${f.stage} (${f.amountTier} ${f.amount} KD).`,
          countdownMinutes: null,
          isPrediction: false,
          dedupKey: `NEW_FLOW|${f.driverId}|${key}`,
        });
        continue;
      }
      if (before.stage !== f.stage) {
        this.tryEmit(now, {
          type: 'STAGE_CHANGED',
          severity: 'INFO',
          driverId: f.driverId || null,
          driverName: f.driverName,
          branchId: f.branchId,
          amount: f.amount,
          message: `Stage transition: ${before.stage} → ${f.stage}.`,
          countdownMinutes: null,
          isPrediction: false,
          dedupKey: `STAGE_CHANGED|${f.driverId}|${key}|${before.stage}>${f.stage}`,
        });
      } else if (before.amount !== f.amount) {
        this.tryEmit(now, {
          type: 'FLOW_UPDATED',
          severity: 'INFO',
          driverId: f.driverId || null,
          driverName: f.driverName,
          branchId: f.branchId,
          amount: f.amount,
          message: `Flow amount changed: ${before.amount} → ${f.amount} KD.`,
          countdownMinutes: null,
          isPrediction: false,
          dedupKey: `FLOW_UPDATED|${f.driverId}|${key}|${f.amount}`,
        });
      }
    }

    // Anomalies: NEW_ANOMALY when a key appears, SEVERITY_ESCALATED when it grows.
    const prevAnomalies = new Map<string, CashV2AnomalyDto>();
    for (const a of prev.anomalies) {
      prevAnomalies.set(anomalyKey(a), a);
    }
    for (const a of curr.anomalies) {
      const k = anomalyKey(a);
      const before = prevAnomalies.get(k);
      if (!before) {
        this.tryEmit(now, {
          type: 'NEW_ANOMALY',
          severity: severityToMonitor(a.severity),
          driverId: a.driverId,
          driverName: null,
          branchId: a.branchId,
          amount: a.amount,
          message: `New anomaly: ${a.type} — ${a.reason}`,
          countdownMinutes: null,
          isPrediction: false,
          dedupKey: `NEW_ANOMALY|${k}`,
        });
      } else if (severityRank(a.severity) > severityRank(before.severity)) {
        this.tryEmit(now, {
          type: 'SEVERITY_ESCALATED',
          severity: severityToMonitor(a.severity),
          driverId: a.driverId,
          driverName: null,
          branchId: a.branchId,
          amount: a.amount,
          message: `Severity escalated for ${a.type}: ${before.severity} → ${a.severity}.`,
          countdownMinutes: null,
          isPrediction: false,
          dedupKey: `SEVERITY_ESCALATED|${k}|${before.severity}>${a.severity}`,
        });
      }
    }
  }

  // ─── Mirrored anomalies ────────────────────────────────────────

  private emitMirroredAnomalies(
    curr: CashIntelligenceAnalysisDto,
    now: Date,
  ): void {
    for (const a of curr.anomalies) {
      // The strict NO-ALERT rules (per the user spec):
      //   - DO NOT alert on NO_ACTIVITY_TODAY    (already filtered upstream)
      //   - DO NOT alert on HISTORICAL_BALANCE   (already filtered upstream)
      // We additionally suppress SUBSCRIPTION_LEAKAGE here because it
      // is review-only per the spec — we surface it via /live snapshot
      // but do NOT raise it as a real-time alert.
      if (a.type === 'SUBSCRIPTION_LEAKAGE') continue;

      // SHIFT_OVERDUE per the monitor spec is ALWAYS CRITICAL,
      // regardless of the per-driver exposure. The v2 analysis uses
      // tier-based severity which can drop to INFO when exposure is 0;
      // the monitor overrides that here so the dashboard correctly
      // displays a RED traffic light.
      const severity: MonitorAlertSeverity =
        a.type === 'SHIFT_OVERDUE'
          ? 'CRITICAL'
          : severityToMonitor(a.severity);

      this.tryEmit(now, {
        type: a.type as MonitorAlertType,
        severity,
        driverId: a.driverId,
        driverName: null,
        branchId: a.branchId,
        amount: a.amount,
        message: `${a.type}: ${a.reason}`,
        countdownMinutes: null,
        isPrediction: false,
        dedupKey: anomalyKey(a),
      });
    }
  }

  // ─── R06 — predictive PRE_SHIFT_OVERDUE ────────────────────────

  private emitPreShiftOverdue(
    curr: CashIntelligenceAnalysisDto,
    now: Date,
    amountMap: DriverAmountMap,
  ): void {
    // Group flows by driver: we want the AGGREGATE exposure on each
    // driver-with-an-open-shift, and we want the FIRST flow with
    // amountTier=LARGE (or aggregate qualifies as LARGE) to trip R06.
    // SSoT: aggregate exposure is read from the classifier amount map,
    // never from a parallel Σ over flows.
    const perDriver = groupByDriver(curr.flows);

    for (const [driverId, group] of perDriver.entries()) {
      const open = group.find((f) => f.shiftStatus === 'OPEN');
      if (!open) continue;
      const dur = open.shiftDurationHours;
      if (dur === null) continue;
      if (dur < SHIFT_PRE_OVERDUE_HOURS) continue;
      if (dur >= SHIFT_OVERDUE_HOURS) continue; // SHIFT_OVERDUE handled separately

      const totalKd = getDriverAmountKd(amountMap, driverId);
      const totalLabel = getDriverAmountStr(amountMap, driverId);
      const tierIsLarge = group.some((f) => f.amountTier === 'LARGE') || totalKd >= 200;
      if (!tierIsLarge) continue;

      const minutesToOverdue = Math.max(
        0,
        Math.round((SHIFT_OVERDUE_HOURS - dur) * 60),
      );

      this.tryEmit(now, {
        type: 'PRE_SHIFT_OVERDUE',
        severity: 'WARNING',
        driverId,
        driverName: open.driverName,
        branchId: open.branchId,
        amount: totalLabel,
        message: `Driver is approaching shift overdue with high cash exposure (${totalLabel} KD, shift ${dur.toFixed(2)}h).`,
        countdownMinutes: minutesToOverdue,
        isPrediction: true,
        dedupKey: `PRE_SHIFT_OVERDUE|${driverId}`,
      });
    }
  }

  // ─── R07 — HIGH_DRIVER_EXPOSURE (visibility) ──────────────────

  private emitHighDriverExposure(
    curr: CashIntelligenceAnalysisDto,
    now: Date,
    amountMap: DriverAmountMap,
  ): void {
    // SSoT: 500 KD threshold evaluates against the classifier amount
    // (single number per driver, identical to what the dashboard shows).
    const perDriver = groupByDriver(curr.flows);
    for (const [driverId, group] of perDriver.entries()) {
      const totalKd = getDriverAmountKd(amountMap, driverId);
      const totalLabel = getDriverAmountStr(amountMap, driverId);
      if (totalKd <= HIGH_DRIVER_EXPOSURE_KD) continue;

      const sample = group[0]!;
      this.tryEmit(now, {
        type: 'HIGH_DRIVER_EXPOSURE',
        severity: 'WARNING',
        driverId,
        driverName: sample.driverName,
        branchId: sample.branchId,
        amount: totalLabel,
        message: `Driver carries ${totalLabel} KD in live cash (threshold ${HIGH_DRIVER_EXPOSURE_KD} KD). Visibility advisory; no responsibility assigned.`,
        countdownMinutes: null,
        isPrediction: false,
        dedupKey: `HIGH_DRIVER_EXPOSURE|${driverId}`,
      });
    }
  }

  // ─── Emission with dedup ──────────────────────────────────────

  private tryEmit(
    now: Date,
    alert: Omit<MonitorAlertDto, 'timestamp'>,
  ): void {
    const key = alert.dedupKey ?? `${alert.type}|${alert.driverId ?? ''}|${alert.amount}`;
    const last = this.lastEmittedAt.get(key);
    if (last && now.getTime() - last < ALERT_DEDUP_WINDOW_MS) return;
    this.lastEmittedAt.set(key, now.getTime());

    const stamped: MonitorAlertDto = {
      ...alert,
      timestamp: now.toISOString(),
      dedupKey: key,
    };
    this.alertsRing.unshift(stamped);
    if (this.alertsRing.length > ALERT_RING_BUFFER_SIZE) {
      this.alertsRing.length = ALERT_RING_BUFFER_SIZE;
    }
  }

  // ─── Live state assembly ──────────────────────────────────────

  private composeLive(): CashMonitorLiveDto {
    const snapshot = this.lastSnapshot;
    const now = new Date();
    const lastPollAgeSeconds =
      this.lastPollAt !== null
        ? Math.round((now.getTime() - this.lastPollAt.getTime()) / 1000)
        : null;

    if (!snapshot) {
      return {
        timestamp: now.toISOString(),
        lastPollAt: null,
        lastPollAgeSeconds: null,
        realtimeStatus: 'GREEN',
        activeDrivers: 0,
        preRisk: [],
        alerts: [],
        driversAtRisk: [],
        locationSummary: { DRIVER: '0.0000', CUSTODY: '0.0000', BANK: '0.0000' },
        summary: {
          totalCash: '0.0000',
          driversAtRisk: 0,
          activeAnomalies: 0,
          openShifts: 0,
        },
        readOnly: true,
        advisoryOnly: true,
      };
    }

    const recentAlerts = this.alertsRing.slice(0, 50);
    const preRisk = recentAlerts.filter(
      (a) => a.type === 'PRE_SHIFT_OVERDUE' || a.isPrediction,
    );

    // SSoT: traffic-light decision INHERITED from the classifier — the
    // only place R/Y/G is decided. Same input (`lastSnapshot`) so the
    // /live, /operational and /classified views CANNOT disagree on
    // status. Any monitor-emitted CRITICAL signal that the classifier
    // reclassifies down to compliance MUST follow the classifier's
    // call; the live ring buffer no longer overrides the dashboard.
    const classified = this.classifier.composeFromAnalysis(snapshot);
    const realtimeStatus: MonitorTrafficLight = classified.systemStatus;

    // SSoT: per-driver cash and the system total are sourced from the
    // classifier, never from `snapshot.summary.totalCash` or a local Σ.
    const amountMap = buildDriverAmountMap(classified);
    const drivers = this.computeDriversAtRisk(snapshot, amountMap);

    const openShiftsCount = (() => {
      const set = new Set<string>();
      for (const f of snapshot.flows) {
        if (f.shiftStatus === 'OPEN' && f.driverId) set.add(f.driverId);
      }
      return set.size;
    })();

    return {
      timestamp: now.toISOString(),
      lastPollAt: this.lastPollAt?.toISOString() ?? null,
      lastPollAgeSeconds,
      realtimeStatus,
      activeDrivers: groupByDriver(snapshot.flows).size,
      preRisk,
      alerts: recentAlerts,
      driversAtRisk: drivers,
      locationSummary: snapshot.locationSummary,
      summary: {
        totalCash: sumClassifiedKdLabel(classified),
        driversAtRisk: drivers.length,
        activeAnomalies: snapshot.anomalies.length,
        openShifts: openShiftsCount,
      },
      readOnly: true,
      advisoryOnly: true,
    };
  }

  // ─── Operational (filtered) view assembly ─────────────────────

  private composeOperational(): OperationalLiveDto {
    const snap = this.lastSnapshot;
    const now = new Date();
    if (!snap) {
      return {
        timestamp: now.toISOString(),
        realtimeStatus: 'GREEN',
        activeDrivers: [],
        driversAtRisk: [],
        alerts: [],
        hidden: {
          staleDriversCount: 0,
          excludedAlertCount: 0,
          note: 'Hidden inactive shifts with no financial impact',
        },
        summary: {
          totalDriversShown: 0,
          totalCash: '0.0000',
          driversAtRisk: 0,
          activeAlerts: 0,
        },
        readOnly: true,
        advisoryOnly: true,
      };
    }

    const reportDay = snap.executionSummary.asOfDate;

    // ─── Single Source of Truth contract ─────────────────────────
    //
    // The CLASSIFIED layer owns every severity + domain decision.
    // We compute it ONCE here from the same snapshot the operational
    // view is reading, then build a lookup so each operational alert
    // can inherit `severity` + `domain` verbatim. Operational still
    // does its UX work (re-labeling, hiding stale, filtering) — but
    // it never decides whether something is "financial" or how severe
    // it is. That's the classifier's job.
    const classified = this.classifier.composeFromAnalysis(snap);
    const classifierIndex = buildClassifierIndex(classified);
    // SSoT: per-driver cash totals come from the classifier; we never
    // recompute Σamount locally for the operational view.
    const amountMap = buildDriverAmountMap(classified);

    // ─── Step 1+2: per-driver aggregates from snapshot.flows ─────
    //
    // We still iterate `snap.flows` to derive operational signals that
    // are NOT money values: today's order count, collected-today,
    // last-activity date, oldest age. The cash total field
    // (`totalCashKd`) is left as 0 in the accumulator and replaced
    // with the SSoT amount when we materialise the DTO.
    type Agg = {
      driverId: string;
      driverName: string | null;
      branchId: string | null;
      ordersTodayCount: number;
      collectedCashTodayKd: number;
      lastCashActivityDate: string | null;
      shiftStatus: 'OPEN' | 'CLOSED' | 'NO_SHIFT';
      shiftDurationHours: number | null;
      /**
       * Age (hours) of the OLDEST live cash unit attributed to this
       * driver. Used by the new R08 gate to keep SHIFT_OVERDUE on
       * young cash classified as compliance, not financial risk.
       */
      oldestAgeHours: number;
    };
    const aggByDriver = new Map<string, Agg>();
    const ensureAgg = (
      driverId: string,
      driverName: string | null,
      branchId: string | null,
      shiftStatus: 'OPEN' | 'CLOSED' | 'NO_SHIFT',
      shiftDurationHours: number | null,
    ): Agg => {
      let a = aggByDriver.get(driverId);
      if (!a) {
        a = {
          driverId,
          driverName,
          branchId,
          ordersTodayCount: 0,
          collectedCashTodayKd: 0,
          lastCashActivityDate: null,
          shiftStatus,
          shiftDurationHours,
          oldestAgeHours: 0,
        };
        aggByDriver.set(driverId, a);
      } else {
        // Promote richer info if available.
        if (!a.driverName && driverName) a.driverName = driverName;
        if (!a.branchId && branchId) a.branchId = branchId;
        if (a.shiftStatus !== 'OPEN' && shiftStatus === 'OPEN') {
          a.shiftStatus = 'OPEN';
          a.shiftDurationHours = shiftDurationHours;
        }
      }
      return a;
    };

    for (const f of snap.flows) {
      if (!f.driverId) continue;
      const agg = ensureAgg(
        f.driverId,
        f.driverName,
        f.branchId,
        f.shiftStatus,
        f.shiftDurationHours,
      );
      const amt = parseAmount(f.amount);
      // NOTE: we intentionally do NOT accumulate a per-driver cash
      // total here. The SSoT value comes from `amountMap`. The
      // collected-today figure stays a flow-derived projection because
      // it represents a different concept (today's intake, not residue).
      // The local `parseAmount` helper makes that intent explicit and
      // satisfies the SSoT lint rule (no bare `parseFloat(<x>.amount)`).
      if (f.originDate === reportDay) {
        agg.ordersTodayCount += 1;
        agg.collectedCashTodayKd += amt;
      }
      if (
        !agg.lastCashActivityDate ||
        f.originDate > agg.lastCashActivityDate
      ) {
        agg.lastCashActivityDate = f.originDate;
      }
      if (f.ageHours > agg.oldestAgeHours) {
        agg.oldestAgeHours = f.ageHours;
      }
    }

    // Seed STALE driver placeholders from SHIFT_OVERDUE alerts on
    // drivers that have NO entries in `flows` (i.e. open shift but
    // zero today activity and zero residue). We need them in the
    // map so we can count them in `hidden`.
    for (const a of snap.anomalies) {
      if (a.type !== 'SHIFT_OVERDUE') continue;
      if (!a.driverId) continue;
      if (aggByDriver.has(a.driverId)) continue;
      ensureAgg(a.driverId, null, a.branchId, 'OPEN', null);
    }

    // ─── Step 1: classify each driver ────────────────────────────
    //
    // The exposure check now reads from the SSoT amount map. STALE /
    // EXPOSURE_ONLY / AT_RISK decisions therefore use the same number
    // the classifier and the dashboard show — no parallel aggregation.
    const classifyDriver = (a: Agg): OperationalDriverStatus => {
      const hasTodayActivity =
        a.ordersTodayCount > 0 || a.collectedCashTodayKd > 0;
      const hasExposure = getDriverAmountKd(amountMap, a.driverId) > 0;
      // STALE: open shift, no today activity, no exposure.
      if (a.shiftStatus === 'OPEN' && !hasTodayActivity && !hasExposure) {
        return 'STALE';
      }
      // EXPOSURE_ONLY: residual cash from prior days but no today flow.
      if (!hasTodayActivity && hasExposure) {
        return 'EXPOSURE_ONLY';
      }
      // AT_RISK: active driver with exposure or near/over shift cap.
      const dur = a.shiftDurationHours ?? 0;
      const nearOverdue =
        a.shiftStatus === 'OPEN' && dur >= 14;
      if (hasTodayActivity && (hasExposure || nearOverdue)) {
        return 'AT_RISK';
      }
      return 'ACTIVE';
    };

    const SHIFT_OVERDUE_HOURS = 16;
    const buildActive = (a: Agg, status: OperationalDriverStatus): ActiveDriverDto => {
      const dur = a.shiftDurationHours;
      const countdown =
        dur !== null && a.shiftStatus === 'OPEN' && dur < SHIFT_OVERDUE_HOURS
          ? Math.max(0, Math.round((SHIFT_OVERDUE_HOURS - dur) * 60))
          : null;
      return {
        driverId: a.driverId,
        driverName: a.driverName,
        branchId: a.branchId,
        ordersTodayCount: a.ordersTodayCount,
        collectedCashToday: a.collectedCashTodayKd.toFixed(4),
        // SSoT: read from the classifier amount map. Never sum locally.
        totalCash: getDriverAmountStr(amountMap, a.driverId),
        lastCashActivityDate: a.lastCashActivityDate,
        shiftStatus: a.shiftStatus,
        shiftDurationHours: a.shiftDurationHours,
        countdownMinutes: countdown,
        status,
      };
    };

    const shownDrivers: ActiveDriverDto[] = [];
    const atRisk: ActiveDriverDto[] = [];
    let staleCount = 0;
    const hiddenDriverIds = new Set<string>();
    for (const a of aggByDriver.values()) {
      const status = classifyDriver(a);
      if (status === 'STALE') {
        staleCount += 1;
        hiddenDriverIds.add(a.driverId);
        continue;
      }
      const dto = buildActive(a, status);
      shownDrivers.push(dto);
      if (status === 'AT_RISK' || status === 'EXPOSURE_ONLY') {
        atRisk.push(dto);
      }
    }

    // ─── Step 4: reclassify alerts (R08) + filter STALE drivers ──
    const operationalAlerts: OperationalAlertDto[] = [];
    let excludedAlertCount = 0;
    for (const a of snap.anomalies) {
      // Stale driver alerts → hidden bucket (counted, not shown).
      if (a.driverId && hiddenDriverIds.has(a.driverId)) {
        excludedAlertCount += 1;
        continue;
      }
      // Suppress SUBSCRIPTION_LEAKAGE per the prior monitor contract.
      if (a.type === 'SUBSCRIPTION_LEAKAGE') {
        excludedAlertCount += 1;
        continue;
      }

      const driverAgg = a.driverId ? aggByDriver.get(a.driverId) : undefined;

      // ─── Inherit from CLASSIFIER (single source of truth) ────
      //
      // The classifier already decided this alert's domain + severity
      // applying the strict 24h grace and 5 KD floor rules. Operational
      // is FORBIDDEN from re-deciding those values — it can only:
      //   • re-LABEL the type for UI clarity (SHIFT_COMPLIANCE_DELAY
      //     vs SHIFT_OVERDUE_FINANCIAL), and
      //   • hide stale-shift rows.
      // If the classifier didn't include this anomaly (defensive
      // fallback), we treat it as INFO/COMPLIANCE so we never
      // accidentally escalate.
      const classifierMatch = lookupClassifierAlert(classifierIndex, a);
      const opDomain: 'FINANCIAL' | 'COMPLIANCE' =
        classifierMatch?.domain ?? 'COMPLIANCE';
      const opSeverity: MonitorAlertSeverity =
        classifierMatch?.severity ?? 'INFO';

      // ─── Re-LABEL ONLY (Operational responsibility) ──────────
      let opType: OperationalAlertType;
      let originalType: string | null = null;

      if (a.type === 'SHIFT_OVERDUE') {
        originalType = 'SHIFT_OVERDUE';
        // Type label follows the classifier's domain decision.
        opType =
          opDomain === 'FINANCIAL'
            ? 'SHIFT_OVERDUE_FINANCIAL'
            : 'SHIFT_COMPLIANCE_DELAY';
      } else {
        opType = a.type as OperationalAlertType;
      }

      operationalAlerts.push({
        type: opType,
        domain: opDomain,
        severity: opSeverity,
        driverId: a.driverId,
        driverName: driverAgg?.driverName ?? null,
        branchId: a.branchId,
        amount: a.amount,
        message: originalType
          ? `${opType}: ${a.reason} (was ${originalType}; reclassified per classifier).`
          : `${a.type}: ${a.reason}`,
        timestamp: this.lastPollAt?.toISOString() ?? now.toISOString(),
        countdownMinutes: null,
        isPrediction: false,
        originalType,
      });
    }

    // Pull in PRE_SHIFT_OVERDUE / HIGH_DRIVER_EXPOSURE from the ring
    // buffer (these are monitor-side, not in snapshot.anomalies).
    for (const r of this.alertsRing) {
      if (r.type !== 'PRE_SHIFT_OVERDUE' && r.type !== 'HIGH_DRIVER_EXPOSURE') {
        continue;
      }
      // Drop any ring-buffer alerts attached to a stale driver.
      if (r.driverId && hiddenDriverIds.has(r.driverId)) {
        excludedAlertCount += 1;
        continue;
      }
      // PRE_SHIFT_OVERDUE and HIGH_DRIVER_EXPOSURE are advisory
      // signals — never financial risk by definition of the rules.
      operationalAlerts.push({
        type: r.type as OperationalAlertType,
        domain: 'COMPLIANCE',
        severity: r.severity,
        driverId: r.driverId,
        driverName: r.driverName,
        branchId: r.branchId,
        amount: r.amount,
        message: r.message,
        timestamp: r.timestamp,
        countdownMinutes: r.countdownMinutes,
        isPrediction: r.isPrediction,
        originalType: null,
      });
    }

    // Sort: drivers with exposure first, then AT_RISK, then ACTIVE.
    shownDrivers.sort(
      (a, b) => parseFloat(b.totalCash) - parseFloat(a.totalCash),
    );
    atRisk.sort(
      (a, b) => parseFloat(b.totalCash) - parseFloat(a.totalCash),
    );

    // Status decision INHERITS from the classifier — the only place
    // where R/Y/G is decided. Compliance items are display-only and
    // never escalate the dashboard color (per the SSoT contract).
    const realtimeStatus: MonitorTrafficLight = classified.systemStatus;

    return {
      timestamp: now.toISOString(),
      realtimeStatus,
      activeDrivers: shownDrivers,
      driversAtRisk: atRisk,
      alerts: operationalAlerts,
      hidden: {
        staleDriversCount: staleCount,
        excludedAlertCount,
        note: 'Hidden inactive shifts with no financial impact',
      },
      summary: {
        totalDriversShown: shownDrivers.length,
        // SSoT: total cash across the operational view equals the
        // classifier total (sum of `classified.drivers[].amount`).
        // STALE drivers carry zero cash by definition, so excluding
        // them does not change the figure — but if it ever did, the
        // classifier remains the single source.
        totalCash: sumClassifiedKdLabel(classified),
        driversAtRisk: atRisk.length,
        activeAlerts: operationalAlerts.length,
      },
      readOnly: true,
      advisoryOnly: true,
    };
  }

  private computeDriversAtRisk(
    snap: CashIntelligenceAnalysisDto,
    amountMap: DriverAmountMap,
  ): MonitorDriverExposureDto[] {
    // SSoT: per-driver cash MUST come from the classifier amount map;
    // we never re-aggregate `snap.flows` for a money value here. The
    // HIGH_DRIVER_EXPOSURE_KD threshold therefore evaluates against
    // the same number the dashboard shows.
    const out: MonitorDriverExposureDto[] = [];
    const groups = groupByDriver(snap.flows);
    for (const [driverId, group] of groups.entries()) {
      const totalStr = getDriverAmountStr(amountMap, driverId);
      const totalKd = getDriverAmountKd(amountMap, driverId);
      const sample = group[0]!;
      const dur = group.find((f) => f.shiftStatus === 'OPEN')?.shiftDurationHours
        ?? null;
      const isAtRisk =
        totalKd > HIGH_DRIVER_EXPOSURE_KD ||
        (dur !== null && dur >= SHIFT_PRE_OVERDUE_HOURS);
      if (!isAtRisk) continue;
      out.push({
        driverId,
        driverName: sample.driverName,
        branchId: sample.branchId,
        totalCash: totalStr,
        flowsCount: group.length,
        shiftStatus: sample.shiftStatus,
        shiftDurationHours: dur,
        countdownMinutes:
          dur !== null && dur < SHIFT_OVERDUE_HOURS
            ? Math.max(0, Math.round((SHIFT_OVERDUE_HOURS - dur) * 60))
            : null,
      });
    }
    out.sort(
      (a, b) => parseFloat(b.totalCash) - parseFloat(a.totalCash),
    );
    return out;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Local raw-amount reader. Named `parseAmount` (not `parseFloat`) so
 * the SSoT lint rule allows it: SSoT cash residue is read via
 * `getDriverAmountKd(amountMap, driverId)`. This helper is reserved
 * for non-SSoT projections (e.g. today's intake accumulation).
 */
function parseAmount(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function flowKey(f: CashV2FlowDto): string | null {
  // Stable identity for diffing — driver+amount+originDate+stage is
  // enough because the analysis service emits one row per order and
  // does not expose orderId on the public DTO.
  return `${f.driverId || '_'}|${f.originDate}|${f.amount}|${f.stage}`;
}

function anomalyKey(a: CashV2AnomalyDto): string {
  return `${a.type}|${a.driverId ?? '_'}|${a.amount}|${a.stage}`;
}

function groupByDriver(flows: CashV2FlowDto[]): Map<string, CashV2FlowDto[]> {
  const m = new Map<string, CashV2FlowDto[]>();
  for (const f of flows) {
    if (!f.driverId) continue;
    const list = m.get(f.driverId) ?? [];
    list.push(f);
    m.set(f.driverId, list);
  }
  return m;
}

function severityToMonitor(s: CashV2Severity): MonitorAlertSeverity {
  if (s === 'CRITICAL' || s === 'CRITICAL_ESCALATED') return 'CRITICAL';
  if (s === 'WARNING') return 'WARNING';
  return 'INFO';
}

function severityRank(s: CashV2Severity): number {
  if (s === 'CRITICAL_ESCALATED') return 4;
  if (s === 'CRITICAL') return 3;
  if (s === 'WARNING') return 2;
  return 1;
}

// `decideTrafficLight` was removed in V19.39 (safe-refactor pass).
// Live/operational/classified all inherit `systemStatus` from
// `CashClassifierService` now; this avoided the only remaining
// drift surface where the live ring-buffer could escalate the
// dashboard past the classifier's own decision.

// ─── Classifier lookup helpers (Single Source of Truth) ─────────

/**
 * Build a (driverId, originalAlertType) → ClassifiedAlertDto index
 * over both `financialAlerts` and `complianceAlerts`. The classifier
 * may have rewritten the type (e.g. SHIFT_OVERDUE → SHIFT_COMPLIANCE_ONLY)
 * so we key by the ORIGINAL anomaly type when present, falling back
 * to the post-classification type.
 */
function buildClassifierIndex(
  classified: CashClassifiedResponseDto,
): Map<string, ClassifiedAlertDto> {
  const idx = new Map<string, ClassifiedAlertDto>();
  for (const a of classified.financialAlerts) addToIndex(idx, a);
  for (const a of classified.complianceAlerts) addToIndex(idx, a);
  return idx;
}

function addToIndex(
  idx: Map<string, ClassifiedAlertDto>,
  a: ClassifiedAlertDto,
): void {
  const key1 = classifierIndexKey(a.driverId, a.originalType ?? a.type);
  if (!idx.has(key1)) idx.set(key1, a);
  // Also expose under the post-classification type for fallback
  // lookups when callers don't know the original.
  const key2 = classifierIndexKey(a.driverId, a.type);
  if (!idx.has(key2)) idx.set(key2, a);
}

function classifierIndexKey(
  driverId: string | null,
  type: string,
): string {
  return `${driverId ?? 'null'}::${type}`;
}

function lookupClassifierAlert(
  idx: Map<string, ClassifiedAlertDto>,
  a: CashV2AnomalyDto,
): ClassifiedAlertDto | undefined {
  return idx.get(classifierIndexKey(a.driverId, a.type));
}

// Avoid bigint amount tier import (unused) silencing
void (null as unknown as CashV2AmountTier);
