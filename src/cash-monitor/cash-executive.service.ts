/**
 * CashExecutiveService — STRICTLY READ-ONLY, ADVISORY-ONLY.
 *
 * The CFO-grade composite layer. It does not recompute any financial
 * logic; it COMPOSES the existing layers:
 *
 *   - `/live`        (audit truth, full alert list, exposure totals)
 *   - `/operational` (filtered display, R08 reclassification, hidden counts)
 *   - `/decisions`   (sorted recommendations + top risk)
 *
 * On top of that composition it adds:
 *
 *   - Layer 3 status normalisation (CRITICAL → RED, WARNING → YELLOW, else GREEN)
 *     using the operational alerts (the ones the operator will actually see).
 *   - Layer 5 responsibility assignment per alert type, suppressed when there
 *     is no financial exposure (zero-cash / stale advisories).
 *   - Layer 6 priority ranking — already done in `/decisions`; we just project.
 *   - A constant `decisionNote` so the dashboard can render a verbatim banner
 *     reminding everyone that this layer is advisory.
 *
 * Contract:
 *   - Never calls a mutating Prisma method.
 *   - Never queues a job, sends a notification, or contacts an external
 *     system. It is a pure projection.
 *   - Same input snapshots → same output (deterministic).
 */
import { Injectable, Logger } from '@nestjs/common';
import { CashMonitorService } from './cash-monitor.service';
import { CashDecisionService } from './cash-decision.service';
import { CashExecutionTrackerService } from './cash-execution-tracker.service';
import {
  CashDecisionsResponseDto,
  DecisionUrgency,
} from './dto/cash-decision.dto';
import {
  OperationalAlertDto,
  OperationalLiveDto,
} from './dto/cash-monitor-operational.dto';
import { CashMonitorLiveDto } from './dto/cash-monitor.dto';
import {
  CashExecutiveResponseDto,
  ExecutiveActionDto,
  ExecutiveResponsible,
  ExecutiveTopRiskDto,
} from './dto/cash-executive.dto';
import { CashClassifiedResponseDto } from './dto/cash-classified.dto';
import { CashExposureService } from './cash-exposure.service';
import { ExposureSilentAlertDto } from './dto/cash-exposure.dto';
import { sumClassifiedKdLabel } from './driver-amount-map';

const DECISION_NOTE = 'Actions are advisory only. No automatic enforcement.';

@Injectable()
export class CashExecutiveService {
  private readonly logger = new Logger(CashExecutiveService.name);

  constructor(
    private readonly monitor: CashMonitorService,
    private readonly decisions: CashDecisionService,
    private readonly tracker: CashExecutionTrackerService,
    private readonly exposure: CashExposureService,
  ) {}

  /**
   * OWNER / GENERAL_MANAGER / ACCOUNTANT entry point — receives the
   * full executive view INCLUDING the silent financial-safety alerts.
   * The MANAGER path goes through `compose()` directly with
   * `silentAlerts = null` (see the controller).
   */
  async getExecutiveView(): Promise<CashExecutiveResponseDto> {
    // We MUST wait for the live snapshot to land before fanning out:
    // `getLive`, `getOperationalView` and `getDecisions` all share the
    // same in-memory snapshot via `CashMonitorService.pollSafe()`, and
    // its "poll in progress" guard means only one parallel caller runs
    // the actual poll while the others race ahead with a null state.
    // Awaiting `getLive` first guarantees the snapshot is populated.
    const live = await this.monitor.getLive();
    const [operational, decisions, classified, exposure] = await Promise.all([
      this.monitor.getOperationalView(),
      this.decisions.getDecisions(),
      this.monitor.getClassified(),
      this.exposure.computeExposure(),
    ]);

    return await this.compose(
      live,
      operational,
      decisions,
      classified,
      exposure.silentAlerts,
    );
  }

  /**
   * Public so the controller can pass branch-scoped inputs (for the
   * MANAGER role) and get a scoped executive view without re-running
   * any financial logic. The executive layer is a pure projection.
   *
   * SINGLE SOURCE OF TRUTH:
   *   `systemStatus` is INHERITED from `classified.systemStatus`. The
   *   executive layer never re-decides severity or domain — it can
   *   only prioritise and assign responsibility (per the SSoT
   *   contract).
   */
  async compose(
    live: CashMonitorLiveDto,
    operational: OperationalLiveDto,
    decisions: CashDecisionsResponseDto,
    classified: CashClassifiedResponseDto,
    silentAlerts: ExposureSilentAlertDto[] | null,
  ): Promise<CashExecutiveResponseDto> {
    // Layer 3 — status inherited from the classifier (single source
    // of truth). Compliance items never escalate the dashboard.
    const systemStatus = classified.systemStatus;

    // Build the canonical cash total ONCE — this is the SSoT figure
    // every layer (live, operational, executive auditReference) MUST
    // echo verbatim. We use the fixed-4 KD label so cross-layer checks
    // can be exact string equality, not tolerance arithmetic.
    const ssotTotalCash = sumClassifiedKdLabel(classified);

    // Build a quick alert-type → operational alert lookup so we can attach
    // responsibility back onto each decision action.
    const alertIndex = new Map<string, OperationalAlertDto>();
    for (const a of operational.alerts) {
      const k = alertKey(a.type, a.driverId, a.timestamp);
      alertIndex.set(k, a);
    }

    // Layer 5 + Layer 7 — project decisions to the executive shape.
    const actions: ExecutiveActionDto[] = decisions.actions.map((d) => {
      const op = alertIndex.get(alertKey(d.alertType, d.driverId, d.timestamp));
      const responsible = assignResponsibility(d.alertType, d.amount, op);
      return {
        driverName: d.driverName,
        action: d.action,
        urgency: d.urgency,
        responsible,
        amount: d.amount,
        alertType: d.alertType,
      };
    });

    let topRisk = projectTopRisk(decisions, actions);

    // V19.37 — execution tracking embed.
    // Look up the topRisk driver's tracking state (or null when there
    // is no topRisk) so the dashboard can render the IN_PROGRESS chip,
    // last action, and REPEAT_ISSUE badge without a follow-up call.
    if (topRisk && topRisk.driverId) {
      const block = await this.tracker.getExecutionBlock(topRisk.driverId);
      topRisk = { ...topRisk, execution: block };
    } else if (topRisk) {
      topRisk = { ...topRisk, execution: null };
    }

    // Audit reference — preserves the full truth from `/live`.
    const totalAuditAlerts = live.preRisk.length + live.alerts.length;

    const response: CashExecutiveResponseDto = {
      systemStatus,
      generatedAt: new Date().toISOString(),
      topRisk,
      actions,
      summary: {
        activeDrivers: operational.activeDrivers.length,
        driversAtRisk: operational.driversAtRisk.length,
        // SSoT: financial severity counts come from `classified` only.
        // Compliance items are operationally relevant but never count
        // toward critical / warning escalations in the executive view.
        criticalAlerts: classified.financialAlerts.filter(
          (a) => a.severity === 'CRITICAL',
        ).length,
        warningAlerts: classified.financialAlerts.filter(
          (a) => a.severity === 'WARNING',
        ).length,
      },
      auditReference: {
        totalAlerts: totalAuditAlerts,
        hiddenStaleDrivers: operational.hidden.staleDriversCount,
        // SSoT: total cash-in-flight = Σ classified.drivers[].amount.
        // Never inherit live.summary.totalCash, which historically
        // sourced its number from the v2 snapshot summary (different
        // filtering than the classifier).
        totalCashInFlight: ssotTotalCash,
        lastPollAt: live.lastPollAt,
      },
      decisionNote: DECISION_NOTE,
      // Silent alerts are PASSED THROUGH from the controller's audience
      // decision. Manager calls always pass `null`; accountant /
      // executive calls pass the live exposure feed.
      silentAlerts,
      readOnly: true,
      advisoryOnly: true,
    };

    // SSoT enforcement — dev-throws / prod-logs if ANY layer
    // (including the executive snapshot we just built) reports a
    // cash number or traffic light different from the classifier.
    // We run this AFTER building the response so the `executive`
    // snapshot can be checked too — guaranteeing the fingerprint
    // of every layer agrees on the SSoT value.
    assertSsotConsistency({
      logger: this.logger,
      classified,
      ssotTotalCash,
      live,
      operational,
      executive: response,
    });

    return response;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Single Source of Truth assertion (the GLOBAL SSoT GUARD).
 *
 * Enforces the contract:
 *
 *   live.summary.totalCash
 *   operational.summary.totalCash
 *   executive.auditReference.totalCashInFlight
 *   ALL  ===  Σ classified.drivers[].amount  (fixed-4 string)
 *
 * AND
 *
 *   live.realtimeStatus
 *   operational.realtimeStatus
 *   executive.systemStatus
 *   ALL  ===  classified.systemStatus
 *
 * Comparison is exact string equality on the canonical fixed-4 KD
 * label produced by `sumClassifiedKdLabel(classified)` — the only
 * money formatter every layer is allowed to call. This catches a
 * drift the moment any future change reintroduces a parallel
 * aggregation path or forgets to inherit `classified.systemStatus`.
 *
 * Behaviour on violation:
 *   - `NODE_ENV !== 'production'`  → throw `SSoT VIOLATION: CASH DRIFT
 *     DETECTED` with a structured detail line. Tests, `/verify`, and
 *     the audit script all see this immediately.
 *   - production                   → Logger.error and let the request complete.
 *     A stale status pill or near-miss
 *     total is preferable to a 500 on a dashboard the operators
 *     depend on.
 */
function assertSsotConsistency(input: {
  logger: Logger;
  classified: CashClassifiedResponseDto;
  ssotTotalCash: string;
  live: CashMonitorLiveDto;
  operational: OperationalLiveDto;
  executive: CashExecutiveResponseDto;
}): void {
  const { logger, classified, ssotTotalCash, live, operational, executive } =
    input;
  const expectedStatus = classified.systemStatus;

  const drifts: Array<{ layer: string; observed: string }> = [];

  // Status invariant — every consumer layer must echo the classifier.
  if (live.realtimeStatus !== expectedStatus) {
    drifts.push({
      layer: 'live.realtimeStatus',
      observed: live.realtimeStatus,
    });
  }
  if (operational.realtimeStatus !== expectedStatus) {
    drifts.push({
      layer: 'operational.realtimeStatus',
      observed: operational.realtimeStatus,
    });
  }
  if (executive.systemStatus !== expectedStatus) {
    drifts.push({
      layer: 'executive.systemStatus',
      observed: executive.systemStatus,
    });
  }

  // Cash total invariant — exact string equality on the canonical
  // fixed-4 KD label. Every layer is supposed to derive its summary
  // value from `sumClassifiedKdLabel(classified)`; a string mismatch
  // proves another producer has slipped in.
  if (live.summary.totalCash !== ssotTotalCash) {
    drifts.push({
      layer: 'live.summary.totalCash',
      observed: live.summary.totalCash,
    });
  }
  if (operational.summary.totalCash !== ssotTotalCash) {
    drifts.push({
      layer: 'operational.summary.totalCash',
      observed: operational.summary.totalCash,
    });
  }
  if (executive.auditReference.totalCashInFlight !== ssotTotalCash) {
    drifts.push({
      layer: 'executive.auditReference.totalCashInFlight',
      observed: executive.auditReference.totalCashInFlight,
    });
  }

  if (drifts.length === 0) return;

  const detail = drifts.map((d) => `${d.layer}=${d.observed}`).join(', ');
  const msg = `SSoT VIOLATION: CASH DRIFT DETECTED — classifier=${expectedStatus} (Σamount=${ssotTotalCash}) but ${detail}. The classifier is the ONLY sanctioned source of systemStatus and per-driver cash.`;
  logger.error(msg);
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(msg);
  }
}

/**
 * Layer 5 — responsibility assignment.
 *
 * Rules:
 *   - Zero financial exposure → ALWAYS null (no blame).
 *   - Predictive / visibility advisories (PRE_SHIFT_OVERDUE,
 *     HIGH_DRIVER_EXPOSURE, SHIFT_COMPLIANCE_DELAY) → null even when
 *     exposure exists; these are early warnings, not real delays.
 *   - DRIVER       → driver-held cash beyond shift cap or stuck on driver.
 *   - BRANCH_MANAGER → handover landed but custody bag missing /
 *                      custody bag pending deposit slip.
 *   - ACCOUNTANT   → deposit not registered or amount mismatches.
 *   - SYSTEM       → linkage / data-integrity issues.
 */
function assignResponsibility(
  alertType: string,
  amount: string,
  op: OperationalAlertDto | undefined,
): ExecutiveResponsible {
  const exposure = parseFloat(amount) || 0;
  if (exposure <= 0) return null;

  // Predictive / visibility-only — never assign blame even with exposure.
  if (
    alertType === 'PRE_SHIFT_OVERDUE' ||
    alertType === 'HIGH_DRIVER_EXPOSURE' ||
    alertType === 'SHIFT_COMPLIANCE_DELAY'
  ) {
    return null;
  }

  switch (alertType) {
    case 'SHIFT_OVERDUE_FINANCIAL':
    case 'STUCK_AT_DRIVER':
      return 'DRIVER';

    case 'HANDOVER_DELAY':
    case 'CUSTODY_DELAY':
      return 'BRANCH_MANAGER';

    case 'DEPOSIT_NOT_REGISTERED':
    case 'DEPOSIT_AMOUNT_MISMATCH':
    case 'OVERPAYMENT_ANOMALY':
      return 'ACCOUNTANT';

    case 'DOUBLE_COUNT_RISK':
      return 'SYSTEM';

    default:
      return null;
  }
}

function projectTopRisk(
  decisions: CashDecisionsResponseDto,
  projected: ExecutiveActionDto[],
): ExecutiveTopRiskDto | null {
  const top = decisions.topRisk;
  if (!top) return null;

  const projectedTop = projected[0];

  return {
    driverId: top.driverId,
    driverName: top.driverName,
    branchId: top.branchId,
    amount: top.amount,
    issue: top.issue,
    action: top.action,
    urgency: top.urgency as DecisionUrgency,
    responsible: projectedTop?.responsible ?? null,
    recommendedSteps: top.recommendedSteps,
    alertType: top.alertType,
    // execution is filled by the caller (composer) via the tracker;
    // we initialise to null so the type stays sound at this layer.
    execution: null,
  };
}

function alertKey(
  type: string,
  driverId: string | null,
  timestamp: string,
): string {
  return `${type}::${driverId ?? '_'}::${timestamp}`;
}
