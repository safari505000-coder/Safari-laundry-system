/**
 * CashMonitorController — STRICTLY READ-ONLY.
 *
 * Exposes a single GET endpoint that surfaces the current live monitor
 * snapshot. The endpoint never triggers a write, never queues a job,
 * and never asks any other service to mutate state.
 *
 * Authorisation mirrors the v2 analysis controller:
 *   OWNER, GENERAL_MANAGER, ACCOUNTANT — full visibility.
 *   MANAGER                            — clamped to JWT branch via a
 *                                        pure projection (no service
 *                                        re-run, no money math).
 */
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permissions } from '../auth/permissions/permissions.decorator';
import { AppPermission } from '../auth/permissions/permissions.enum';
import { CashMonitorService } from './cash-monitor.service';
import { CashDecisionService } from './cash-decision.service';
import { CashExecutiveService } from './cash-executive.service';
import { CashExecutionTrackerService } from './cash-execution-tracker.service';
import { CashRiskService } from './cash-risk.service';
import { CashClassifierService } from './cash-classifier.service';
import { CashExposureService } from './cash-exposure.service';
import { SystemVerifyService } from './system-verify.service';
import { IntegrityAuditService } from './integrity-audit.service';
import { DriverAmountAuditService } from './driver-amount-audit.service';
import { RoleConsistencyService } from './role-consistency.service';
import { CashExplainService } from './cash-explain.service';
import { CashDashboardService } from './cash-dashboard.service';
import { BranchCashLedgerService } from './branch-cash-ledger.service';
import { CashExposureResponseDto } from './dto/cash-exposure.dto';
import { SystemVerifyResponseDto } from './dto/system-verify.dto';
import { IntegrityAuditResponseDto } from './dto/integrity-audit.dto';
import { DriverAmountAuditResponseDto } from './dto/driver-amount-audit.dto';
import { CashExplainResponseDto } from './dto/cash-explain.dto';
import { CashDashboardResponseDto } from './dto/cash-dashboard.dto';
import { CashMonitorLiveDto } from './dto/cash-monitor.dto';
import { OperationalLiveDto } from './dto/cash-monitor-operational.dto';
import { CashDecisionsResponseDto } from './dto/cash-decision.dto';
import { CashExecutiveResponseDto } from './dto/cash-executive.dto';
import {
  CashExecutionActionRequestDto,
  CashExecutionActionResponseDto,
} from './dto/cash-execution.dto';
import { CashRiskResponseDto } from './dto/cash-risk.dto';
import { CashClassifiedResponseDto } from './dto/cash-classified.dto';
import {
  scopeClassifiedByBranch,
  scopeDecisionsByBranch,
  scopeExplainByBranch,
  scopeLiveByBranch,
  scopeOperationalByBranch,
  scopeRiskByBranch,
} from './scope-by-branch';

@ApiTags('cash-intelligence')
@ApiBearerAuth()
@Controller('cash-intelligence')
@Roles(
  SafariRole.OWNER,
  SafariRole.GENERAL_MANAGER,
  SafariRole.ACCOUNTANT,
  SafariRole.MANAGER,
)
@Permissions(AppPermission.VIEW_CASH)
export class CashMonitorController {
  constructor(
    private readonly monitor: CashMonitorService,
    private readonly decisions: CashDecisionService,
    private readonly executive: CashExecutiveService,
    private readonly tracker: CashExecutionTrackerService,
    private readonly risk: CashRiskService,
    private readonly classifier: CashClassifierService,
    private readonly exposure: CashExposureService,
    private readonly verify: SystemVerifyService,
    private readonly integrity: IntegrityAuditService,
    private readonly driverAmountAudit: DriverAmountAuditService,
    private readonly explain: CashExplainService,
    private readonly dashboard: CashDashboardService,
    private readonly branchLedger: BranchCashLedgerService,
    private readonly roleConsistency: RoleConsistencyService,
  ) {}

  /**
   * Unified UI-ready dashboard.
   *
   * Single backend surface that powers the entire frontend cash
   * dashboard. The frontend MUST NOT compute anything; the response
   * carries every value the UI needs:
   *
   *   • `systemStatus`  — inherited verbatim from the classifier.
   *   • `totalCash`     — Σ classified.drivers[].amount (SSoT).
   *   • `summaryText`   — deterministic Arabic copy keyed on status.
   *   • `alerts`        — financial + compliance buckets verbatim.
   *   • `drivers[]`     — direct projection of classified.drivers.
   *   • `topRisk`       — verbatim from the executive composite.
   *
   * The service runs a runtime SSoT assertion before returning: if the
   * classifier and executive layers disagree on `systemStatus`, or if
   * the response total drifts from `Σ classified.drivers[].amount`,
   * the request fails in dev (`SSoT VIOLATION`) and is logged in prod.
   *
   * MANAGER scope: filtered to JWT branchId by passing the SCOPED
   * classifier into the composer, so the per-driver totals and the
   * branch summary trace back to a single source.
   */
  @Get('dashboard')
  @ApiOkResponse({ type: CashDashboardResponseDto })
  async getDashboard(
    @CurrentUser() user: JwtUser,
  ): Promise<CashDashboardResponseDto> {
    const scope = this.managerBranchId(user);
    if (!scope) return this.dashboard.getDashboard();
    // Branch-scoped path: scope the classifier ONCE and feed it into a
    // branch-scoped executive composite so the dashboard's `topRisk`,
    // alerts, drivers, and total all reflect ONLY this manager's
    // branch. The downstream services never re-derive money. The
    // branch-cash slice is sourced from a branchId-clamped ledger
    // projection -- the manager never observes another branch's cash.
    const live = await this.monitor.getLive();
    const [operational, decisions, classified, branchLedger] = await Promise.all([
      this.monitor.getOperationalView(),
      this.decisions.getDecisions(),
      this.monitor.getClassified(),
      this.branchLedger.project({ branchId: scope }),
    ]);
    const scopedClassified = scopeClassifiedByBranch(classified, scope);
    const scopedExecutive = await this.executive.compose(
      scopeLiveByBranch(live, scope, scopedClassified),
      scopeOperationalByBranch(operational, scope, scopedClassified),
      scopeDecisionsByBranch(decisions, scope),
      scopedClassified,
      // MANAGER role: silent alerts are intentionally null (the
      // dashboard never renders the financial-safety feed for branch
      // managers — that surface is OWNER/GM/ACCOUNTANT only).
      null,
    );
    return this.dashboard.compose(scopedClassified, scopedExecutive, branchLedger);
  }

  /**
   * Live monitor snapshot. The real-time engine polls the v2 analysis
   * every 60s; this endpoint just reads back the cached state plus the
   * recent alert ring buffer. Triggers a lazy first poll on cold start.
   *
   * MANAGER scope: the response is filtered to the JWT branchId — no
   * other branch's drivers, alerts, or exposure can be observed. The
   * branch summary total + per-driver totalCash come from the SCOPED
   * classifier (SSoT), never from a parallel sum over `driversAtRisk`.
   */
  @Get('live')
  @ApiOkResponse({ type: CashMonitorLiveDto })
  async getLive(@CurrentUser() user: JwtUser): Promise<CashMonitorLiveDto> {
    const scope = this.managerBranchId(user);
    if (!scope) return this.monitor.getLive();
    const live = await this.monitor.getLive();
    const scopedClassified = scopeClassifiedByBranch(
      await this.monitor.getClassified(),
      scope,
    );
    return scopeLiveByBranch(live, scope, scopedClassified);
  }

  /**
   * Operational (filtered) view — display-only filter on top of the
   * live snapshot. Hides STALE shifts, reclassifies SHIFT_OVERDUE per
   * R08, and reports the suppressed counts in `hidden.*`. The
   * underlying snapshot, ring buffer and totals are NOT modified.
   *
   * MANAGER scope: response filtered to JWT branchId; per-driver +
   * branch total cash inherited from the SCOPED classifier (SSoT).
   */
  @Get('operational')
  @ApiOkResponse({ type: OperationalLiveDto })
  async getOperational(
    @CurrentUser() user: JwtUser,
  ): Promise<OperationalLiveDto> {
    const scope = this.managerBranchId(user);
    if (!scope) return this.monitor.getOperationalView();
    const view = await this.monitor.getOperationalView();
    const scopedClassified = scopeClassifiedByBranch(
      await this.monitor.getClassified(),
      scope,
    );
    return scopeOperationalByBranch(view, scope, scopedClassified);
  }

  /**
   * Decision engine — converts the operational view into a sorted list
   * of recommended actions plus ONE clear top decision. Read-only and
   * advisory-only: never triggers any side effect. The dashboard uses
   * `topRisk` to render the single most important next step for the
   * operator (per Step 4 FINAL RULE: clarity > completeness).
   *
   * MANAGER scope: response filtered to JWT branchId.
   */
  @Get('decisions')
  @ApiOkResponse({ type: CashDecisionsResponseDto })
  async getDecisions(
    @CurrentUser() user: JwtUser,
  ): Promise<CashDecisionsResponseDto> {
    const res = await this.decisions.getDecisions();
    const scope = this.managerBranchId(user);
    return scope ? scopeDecisionsByBranch(res, scope) : res;
  }

  /**
   * Executive view — CFO-grade composite. Combines:
   *   - `/live`        (audit truth)
   *   - `/operational` (filtered display)
   *   - `/decisions`   (sorted recommendations + top risk)
   * and adds Layer 5 responsibility per alert + an `auditReference`
   * pointer to the underlying audit-truth counts. Read-only,
   * advisory-only, deterministic projection.
   *
   * MANAGER scope: composed from branch-scoped inputs so the entire
   * report — including auditReference.totalAlerts and
   * hiddenStaleDrivers — reflects only the manager's branch.
   */
  @Get('executive')
  @ApiOkResponse({ type: CashExecutiveResponseDto })
  async getExecutive(
    @CurrentUser() user: JwtUser,
  ): Promise<CashExecutiveResponseDto> {
    const scope = this.managerBranchId(user);
    if (!scope) return this.executive.getExecutiveView();
    // Re-derive the executive composite from branch-scoped inputs so
    // every counter on the response (including auditReference.*) is
    // honest about what THIS manager can see. Sequence the live read
    // first so the in-memory snapshot is guaranteed populated before
    // the other two readers race against the poll-in-progress guard.
    const live = await this.monitor.getLive();
    const [operational, decisions, classified] = await Promise.all([
      this.monitor.getOperationalView(),
      this.decisions.getDecisions(),
      this.monitor.getClassified(),
    ]);
    // SSoT: scope the classifier ONCE and feed it into every
    // downstream scope helper, so the per-branch traffic light AND
    // every cash number trace back to a single source.
    const scopedClassified = scopeClassifiedByBranch(classified, scope);
    // MANAGER role MUST NOT see the silent financial-safety alerts —
    // by spec, those are surfaced only on the accountant + executive
    // surfaces. We pass `null` so the response carries an explicit
    // signal that the audience is the manager (and the FE doesn't
    // accidentally render an empty silent feed instead of nothing).
    return await this.executive.compose(
      scopeLiveByBranch(live, scope, scopedClassified),
      scopeOperationalByBranch(operational, scope, scopedClassified),
      scopeDecisionsByBranch(decisions, scope),
      scopedClassified,
      null,
    );
  }

  /**
   * v3 Risk Engine — accurate, fair, low-noise financial risk.
   *
   * Per-CashUnit aging with a strict 24h grace gate. Cash less than
   * 24 hours old NEVER scores and NEVER alerts (Step 3). Shifts longer
   * than 16h on YOUNG cash are capped at WARNING (Step 9) — shift
   * delay alone is never financial risk.
   *
   * MANAGER scope: response filtered to JWT branchId; the underlying
   * v2 analysis is global so OWNER/GM/ACCOUNTANT views remain whole.
   */
  @Get('risk')
  @ApiOkResponse({ type: CashRiskResponseDto })
  async getRisk(
    @CurrentUser() user: JwtUser,
  ): Promise<CashRiskResponseDto> {
    const res = await this.risk.computeRisk();
    const scope = this.managerBranchId(user);
    if (!scope) return res;
    // SSoT: scope the classifier first so the manager's per-driver
    // totalCash, branch summary total, and traffic light all trace
    // back to the SAME `/classified` payload — never re-aggregated
    // from per-driver `totalCash` strings.
    const scopedClassified = scopeClassifiedByBranch(
      await this.monitor.getClassified(),
      scope,
    );
    return scopeRiskByBranch(res, scope, scopedClassified);
  }

  /**
   * Strict FINANCIAL vs OPERATIONAL classifier.
   *
   * Returns the dashboard payload that obeys the hard rules:
   *
   *   - cash age < 24h → forced NON_FINANCIAL
   *   - amount  < 5 KD → never CRITICAL
   *   - SHIFT_OVERDUE on young / small / zero-exposure cash →
   *     SHIFT_COMPLIANCE_ONLY (display-only, no R/Y/G escalation)
   *   - SHIFT_OVERDUE on aged + material cash →
   *     SHIFT_OVERDUE_FINANCIAL (capped at WARNING, never CRITICAL)
   *
   * `systemStatus` is derived from `financialAlerts` ONLY. Compliance
   * items appear in their own bucket and never escalate the dashboard.
   *
   * MANAGER scope: response filtered to JWT branchId.
   */
  @Get('classified')
  @ApiOkResponse({ type: CashClassifiedResponseDto })
  async getClassified(
    @CurrentUser() user: JwtUser,
  ): Promise<CashClassifiedResponseDto> {
    const res = await this.classifier.classify();
    const scope = this.managerBranchId(user);
    return scope ? scopeClassifiedByBranch(res, scope) : res;
  }

  /**
   * Explainability projection — answers "what is in this driver's
   * bag, broken down by the day the cash was earned?". Pure read-
   * only and policy-free: no severity, no aging gate, no thresholds.
   *
   * Numbers reconcile with `/classified.drivers[].amount` because
   * both views derive from the SAME cached snapshot. The breakdown
   * is intended for the dashboard's "explain this number" panel and
   * for finance staff investigating a topRisk driver.
   *
   * MANAGER scope: response filtered to JWT branchId (drivers from
   *   other branches are dropped and totals re-summed).
   */
  @Get('explain')
  @ApiOkResponse({ type: CashExplainResponseDto })
  async getExplain(
    @CurrentUser() user: JwtUser,
  ): Promise<CashExplainResponseDto> {
    const res = await this.explain.getExplain();
    const scope = this.managerBranchId(user);
    if (!scope) return res;
    const scopedClassified = scopeClassifiedByBranch(
      await this.monitor.getClassified(),
      scope,
    );
    return scopeExplainByBranch(res, scope, scopedClassified);
  }

  /**
   * Record an operator action on a driver. This is the FIRST writeable
   * surface in the cash-intelligence stack. It NEVER touches financial
   * state — only the in-process execution-tracker store.
   *
   * Behaviour (per spec §3 auto state transitions):
   *   - On any logged action the status flips OPEN → IN_PROGRESS.
   *   - The next monitor snapshot that drops the driver from
   *     `driversAtRisk` will auto-resolve the record to RESOLVED.
   *
   * MANAGER scope: the driverId MUST belong to a driver currently
   * visible in the manager's scoped operational view (active + at
   * risk). Cross-branch action attempts return 403. OWNER / GM /
   * ACCOUNTANT can act on any driver.
   */
  @Post('action')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CashExecutionActionResponseDto })
  async recordAction(
    @Body() body: CashExecutionActionRequestDto,
    @CurrentUser() user: JwtUser,
  ): Promise<CashExecutionActionResponseDto> {
    let allowed: ReadonlySet<string> | undefined;
    const scope = this.managerBranchId(user);
    if (scope) {
      // Defence in depth: only accept actions on drivers the manager
      // can actually see right now. We compose the scoped operational
      // view (SSoT-fed via the scoped classifier) and assert
      // membership.
      const scopedClassified = scopeClassifiedByBranch(
        await this.monitor.getClassified(),
        scope,
      );
      const op = scopeOperationalByBranch(
        await this.monitor.getOperationalView(),
        scope,
        scopedClassified,
      );
      const ids = new Set<string>();
      for (const d of op.activeDrivers) ids.add(d.driverId);
      for (const d of op.driversAtRisk) ids.add(d.driverId);
      allowed = ids;
    }

    const block = await this.tracker.recordAction({
      driverId: body.driverId,
      action: body.action,
      note: body.note,
      alertType: body.alertType,
      actor: user.userId ?? null,
      allowedDriverIds: allowed,
    });

    return {
      driverId: body.driverId,
      recordedAt: new Date().toISOString(),
      execution: block,
      readOnlyFinancial: true,
    };
  }

  /**
   * Driver-level exposure + aging escalation surface.
   *
   * Silent financial-safety layer: aggregates every live cash unit per
   * driver, applies amount thresholds (≥200 KD WARNING, ≥500 KD
   * CRITICAL) and aging thresholds (≥24h OVERDUE, ≥48h HIGH_RISK,
   * ≥72h CRITICAL), and emits silent alerts that the manager
   * dashboard never sees.
   *
   * RBAC: OWNER, GENERAL_MANAGER, ACCOUNTANT.
   *   The MANAGER role is INTENTIONALLY excluded — these counters are
   *   designed to surface unnoticed accumulation only to the audience
   *   with a financial-safety mandate.
   *
   * Read-only contract: no DB writes, no queue publishes, no UI side
   * effects. Aggregation reuses the v2 analysis snapshot.
   */
  @Get('exposure')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
  )
  @ApiOkResponse({ type: CashExposureResponseDto })
  async getExposure(
    @CurrentUser() user: JwtUser,
  ): Promise<CashExposureResponseDto> {
    // Defence in depth: the controller-level @Permissions(VIEW_CASH)
    // grant short-circuits the RolesGuard, so we re-assert the
    // role policy here. Branch managers MUST NOT receive driver-level
    // exposure or silent alerts — by spec, this is an
    // accountant + executive surface only.
    if (user.role === SafariRole.MANAGER) {
      throw new ForbiddenException(
        'Driver exposure is restricted to OWNER, GENERAL_MANAGER, and ACCOUNTANT.',
      );
    }
    return this.exposure.computeExposure();
  }

  /**
   * System verification — runs the synthetic safety scenarios through
   * the classifier, the risk engine, and the executive composer, then
   * returns PASS/FAIL with a per-scenario breakdown.
   *
   * RBAC: OWNER + GENERAL_MANAGER only. Manager / Accountant don't
   *   own contract enforcement; they consume the result indirectly via
   *   the dashboard's status pill. The class-level @Roles is overridden
   *   here so the RolesGuard rejects everyone else.
   *
   * READ-ONLY: the underlying service synthesises in-memory analyses
   *   and never invokes the v2 Prisma reader. Defence in depth — we
   *   re-assert the role policy below in case a future change to the
   *   PermissionsGuard short-circuits the role check.
   */
  @Get('verify')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOkResponse({ type: SystemVerifyResponseDto })
  async verifySystem(
    @CurrentUser() user: JwtUser,
  ): Promise<SystemVerifyResponseDto> {
    if (
      user.role !== SafariRole.OWNER &&
      user.role !== SafariRole.GENERAL_MANAGER
    ) {
      throw new ForbiddenException(
        'System verification is restricted to OWNER and GENERAL_MANAGER.',
      );
    }
    return this.verify.run();
  }

  /**
   * Cross-layer integrity audit. Pulls every cash-intelligence layer
   * the dashboard sees and asserts they all agree on the numbers the
   * classifier produced.
   *
   * RBAC: OWNER + GENERAL_MANAGER only — same audience as `/verify`,
   *   since both are safety surfaces, not operational tools.
   *
   * READ-ONLY: the underlying service consumes the snapshot the
   *   running monitor already cached and never recomputes financial
   *   logic. We re-assert the role policy in the handler below as
   *   defence in depth.
   */
  @Get('integrity-audit')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOkResponse({ type: IntegrityAuditResponseDto })
  async runIntegrityAudit(
    @CurrentUser() user: JwtUser,
  ): Promise<IntegrityAuditResponseDto> {
    if (
      user.role !== SafariRole.OWNER &&
      user.role !== SafariRole.GENERAL_MANAGER
    ) {
      throw new ForbiddenException(
        'Integrity audit is restricted to OWNER and GENERAL_MANAGER.',
      );
    }
    return this.integrity.run();
  }

  /**
   * Per-driver cross-layer amount auditor. Detects the symptom
   * "driver shows X KD on one page and Y KD on another" by reading
   * the SAME snapshot the dashboard observes and comparing the
   * per-driver totals across `/classified`, `/risk`, `/live`,
   * `/operational`, `/executive`. Read-only and deterministic.
   *
   * RBAC: OWNER + GENERAL_MANAGER only — re-asserted in the handler.
   */
  @Get('driver-amount-audit')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOkResponse({ type: DriverAmountAuditResponseDto })
  async runDriverAmountAudit(
    @CurrentUser() user: JwtUser,
  ): Promise<DriverAmountAuditResponseDto> {
    if (
      user.role !== SafariRole.OWNER &&
      user.role !== SafariRole.GENERAL_MANAGER
    ) {
      throw new ForbiddenException(
        'Driver-amount audit is restricted to OWNER and GENERAL_MANAGER.',
      );
    }
    return this.driverAmountAudit.run();
  }

  /**
   * Role-consistency audit. Compares `User.safariRole` (enum, used by
   * cash + finance services) against `User.role.name` (relational Role
   * row, used by legacy paths). Drift = a user is misclassified and
   * may appear in one screen while being invisible to another. The
   * audit is read-only; resolution is manual (fix the producer that
   * wrote one column without updating the other).
   *
   * RBAC: OWNER + GENERAL_MANAGER only — re-asserted in the handler.
   */
  @Get('role-consistency-audit')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  async runRoleConsistencyAudit(@CurrentUser() user: JwtUser) {
    if (
      user.role !== SafariRole.OWNER &&
      user.role !== SafariRole.GENERAL_MANAGER
    ) {
      throw new ForbiddenException(
        'Role-consistency audit is restricted to OWNER and GENERAL_MANAGER.',
      );
    }
    return this.roleConsistency.run();
  }

  // ─── Branch clamp ─────────────────────────────────────────────
  // V19.36 — Mirrors `cash-intelligence.controller.ts#clampBranchScope`:
  // a Branch Manager may NEVER see another branch's monitor data. We
  // return the JWT branchId for MANAGER and `null` (= no clamp) for
  // OWNER / GM / ACCOUNTANT, who are allowed full visibility.
  private managerBranchId(user: JwtUser): string | null {
    if (user.role !== SafariRole.MANAGER) return null;
    if (!user.branchId) {
      throw new ForbiddenException(
        'Manager has no branchId on JWT — cannot scope cash monitor view.',
      );
    }
    return user.branchId;
  }
}
