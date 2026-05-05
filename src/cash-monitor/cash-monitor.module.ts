import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CashIntelligenceModule } from '../cash-intelligence/cash-intelligence.module';
import { FinanceModule } from '../finance/finance.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { OwnerAlertNotifierService } from '../system-guardian/owner-alert-notifier.service';
import { CashMonitorController } from './cash-monitor.controller';
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
import { DiagnosticsEngineService } from './diagnostics-engine.service';
import { CashExplainService } from './cash-explain.service';
import { CashDashboardService } from './cash-dashboard.service';
import { CashSafetyAuditCron } from './cash-safety-audit.cron';
import { CashWritePoliceGuard } from './cash-write-police.guard';
import { BranchCashLedgerService } from './branch-cash-ledger.service';
import { RoleConsistencyService } from './role-consistency.service';

/**
 * Cash Monitor — real-time, read-only, advisory-only layer that polls
 * the cash-intelligence v2 analysis every 60s and surfaces predictive
 * + transition alerts via `GET /api/cash-intelligence/live`.
 *
 * Composed endpoints:
 *   /live        — audit truth (full alert list, no filter)
 *   /operational — display-only filter (R08 reclassification, hides STALE)
 *   /decisions   — sorted recommendations + ONE top action
 *   /executive   — CFO-grade composite (status + topRisk + responsibility
 *                  + auditReference)
 *
 * This module imports the cash-intelligence module to consume the v2
 * service. It does NOT export a writer; the only public surface is
 * the GET endpoints and the in-process services the controller calls.
 */
@Module({
  // SystemConfigModule supplies the dynamic guardianPhone the local
  // OwnerAlertNotifierService instance uses for the 5-min cash safety
  // audit's WhatsApp alert. We deliberately register a SECOND notifier
  // instance (rather than importing SystemGuardianModule) to avoid a
  // circular module dependency — system-guardian imports cash-monitor.
  // The notifier is stateless and DB-only on its read path, so two
  // instances are safe.
  imports: [CashIntelligenceModule, SystemConfigModule, FinanceModule],
  controllers: [CashMonitorController],
  providers: [
    CashMonitorService,
    CashDecisionService,
    CashExecutiveService,
    CashExecutionTrackerService,
    CashRiskService,
    CashClassifierService,
    CashExposureService,
    SystemVerifyService,
    IntegrityAuditService,
    DriverAmountAuditService,
    DiagnosticsEngineService,
    CashExplainService,
    CashDashboardService,
    CashSafetyAuditCron,
    CashWritePoliceGuard,
    OwnerAlertNotifierService,
    BranchCashLedgerService,
    RoleConsistencyService,
    // Register the SSoT cash-write police as a global APP_GUARD. It
    // is a no-op on routes that do NOT carry the `@CashWriteEndpoint`
    // metadata, so this single registration covers EVERY future cash-
    // write endpoint anywhere in the codebase without forcing each
    // module to import CashMonitorModule.
    {
      provide: APP_GUARD,
      useClass: CashWritePoliceGuard,
    },
  ],
  // Exported so that platform-wide observability layers (e.g. the
  // System Guardian) can read the SAME live snapshot the dashboard
  // sees without re-running v2 analysis or duplicating logic.
  exports: [
    CashMonitorService,
    CashClassifierService,
    CashRiskService,
    CashExecutiveService,
    SystemVerifyService,
    IntegrityAuditService,
    DriverAmountAuditService,
    DiagnosticsEngineService,
    CashExplainService,
    CashDashboardService,
    CashSafetyAuditCron,
    CashWritePoliceGuard,
    BranchCashLedgerService,
    RoleConsistencyService,
  ],
})
export class CashMonitorModule {}
