"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CashMonitorModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const cash_intelligence_module_1 = require("../cash-intelligence/cash-intelligence.module");
const finance_module_1 = require("../finance/finance.module");
const system_config_module_1 = require("../system-config/system-config.module");
const owner_alert_notifier_service_1 = require("../system-guardian/owner-alert-notifier.service");
const cash_monitor_controller_1 = require("./cash-monitor.controller");
const cash_monitor_service_1 = require("./cash-monitor.service");
const cash_decision_service_1 = require("./cash-decision.service");
const cash_executive_service_1 = require("./cash-executive.service");
const cash_execution_tracker_service_1 = require("./cash-execution-tracker.service");
const cash_risk_service_1 = require("./cash-risk.service");
const cash_classifier_service_1 = require("./cash-classifier.service");
const cash_exposure_service_1 = require("./cash-exposure.service");
const system_verify_service_1 = require("./system-verify.service");
const integrity_audit_service_1 = require("./integrity-audit.service");
const driver_amount_audit_service_1 = require("./driver-amount-audit.service");
const diagnostics_engine_service_1 = require("./diagnostics-engine.service");
const cash_explain_service_1 = require("./cash-explain.service");
const cash_dashboard_service_1 = require("./cash-dashboard.service");
const cash_safety_audit_cron_1 = require("./cash-safety-audit.cron");
const cash_write_police_guard_1 = require("./cash-write-police.guard");
const branch_cash_ledger_service_1 = require("./branch-cash-ledger.service");
const role_consistency_service_1 = require("./role-consistency.service");
let CashMonitorModule = class CashMonitorModule {
};
exports.CashMonitorModule = CashMonitorModule;
exports.CashMonitorModule = CashMonitorModule = __decorate([
    (0, common_1.Module)({
        imports: [cash_intelligence_module_1.CashIntelligenceModule, system_config_module_1.SystemConfigModule, finance_module_1.FinanceModule],
        controllers: [cash_monitor_controller_1.CashMonitorController],
        providers: [
            cash_monitor_service_1.CashMonitorService,
            cash_decision_service_1.CashDecisionService,
            cash_executive_service_1.CashExecutiveService,
            cash_execution_tracker_service_1.CashExecutionTrackerService,
            cash_risk_service_1.CashRiskService,
            cash_classifier_service_1.CashClassifierService,
            cash_exposure_service_1.CashExposureService,
            system_verify_service_1.SystemVerifyService,
            integrity_audit_service_1.IntegrityAuditService,
            driver_amount_audit_service_1.DriverAmountAuditService,
            diagnostics_engine_service_1.DiagnosticsEngineService,
            cash_explain_service_1.CashExplainService,
            cash_dashboard_service_1.CashDashboardService,
            cash_safety_audit_cron_1.CashSafetyAuditCron,
            cash_write_police_guard_1.CashWritePoliceGuard,
            owner_alert_notifier_service_1.OwnerAlertNotifierService,
            branch_cash_ledger_service_1.BranchCashLedgerService,
            role_consistency_service_1.RoleConsistencyService,
            {
                provide: core_1.APP_GUARD,
                useClass: cash_write_police_guard_1.CashWritePoliceGuard,
            },
        ],
        exports: [
            cash_monitor_service_1.CashMonitorService,
            cash_classifier_service_1.CashClassifierService,
            cash_risk_service_1.CashRiskService,
            cash_executive_service_1.CashExecutiveService,
            system_verify_service_1.SystemVerifyService,
            integrity_audit_service_1.IntegrityAuditService,
            driver_amount_audit_service_1.DriverAmountAuditService,
            diagnostics_engine_service_1.DiagnosticsEngineService,
            cash_explain_service_1.CashExplainService,
            cash_dashboard_service_1.CashDashboardService,
            cash_safety_audit_cron_1.CashSafetyAuditCron,
            cash_write_police_guard_1.CashWritePoliceGuard,
            branch_cash_ledger_service_1.BranchCashLedgerService,
            role_consistency_service_1.RoleConsistencyService,
        ],
    })
], CashMonitorModule);
//# sourceMappingURL=cash-monitor.module.js.map