"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CashMonitorController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const permissions_decorator_1 = require("../auth/permissions/permissions.decorator");
const permissions_enum_1 = require("../auth/permissions/permissions.enum");
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
const role_consistency_service_1 = require("./role-consistency.service");
const cash_explain_service_1 = require("./cash-explain.service");
const cash_dashboard_service_1 = require("./cash-dashboard.service");
const branch_cash_ledger_service_1 = require("./branch-cash-ledger.service");
const cash_exposure_dto_1 = require("./dto/cash-exposure.dto");
const system_verify_dto_1 = require("./dto/system-verify.dto");
const integrity_audit_dto_1 = require("./dto/integrity-audit.dto");
const driver_amount_audit_dto_1 = require("./dto/driver-amount-audit.dto");
const cash_explain_dto_1 = require("./dto/cash-explain.dto");
const cash_dashboard_dto_1 = require("./dto/cash-dashboard.dto");
const cash_monitor_dto_1 = require("./dto/cash-monitor.dto");
const cash_monitor_operational_dto_1 = require("./dto/cash-monitor-operational.dto");
const cash_decision_dto_1 = require("./dto/cash-decision.dto");
const cash_executive_dto_1 = require("./dto/cash-executive.dto");
const cash_execution_dto_1 = require("./dto/cash-execution.dto");
const cash_risk_dto_1 = require("./dto/cash-risk.dto");
const cash_classified_dto_1 = require("./dto/cash-classified.dto");
const scope_by_branch_1 = require("./scope-by-branch");
let CashMonitorController = class CashMonitorController {
    monitor;
    decisions;
    executive;
    tracker;
    risk;
    classifier;
    exposure;
    verify;
    integrity;
    driverAmountAudit;
    explain;
    dashboard;
    branchLedger;
    roleConsistency;
    constructor(monitor, decisions, executive, tracker, risk, classifier, exposure, verify, integrity, driverAmountAudit, explain, dashboard, branchLedger, roleConsistency) {
        this.monitor = monitor;
        this.decisions = decisions;
        this.executive = executive;
        this.tracker = tracker;
        this.risk = risk;
        this.classifier = classifier;
        this.exposure = exposure;
        this.verify = verify;
        this.integrity = integrity;
        this.driverAmountAudit = driverAmountAudit;
        this.explain = explain;
        this.dashboard = dashboard;
        this.branchLedger = branchLedger;
        this.roleConsistency = roleConsistency;
    }
    async getDashboard(user) {
        const scope = this.managerBranchId(user);
        if (!scope)
            return this.dashboard.getDashboard();
        const live = await this.monitor.getLive();
        const [operational, decisions, classified, branchLedger] = await Promise.all([
            this.monitor.getOperationalView(),
            this.decisions.getDecisions(),
            this.monitor.getClassified(),
            this.branchLedger.project({ branchId: scope }),
        ]);
        const scopedClassified = (0, scope_by_branch_1.scopeClassifiedByBranch)(classified, scope);
        const scopedExecutive = await this.executive.compose((0, scope_by_branch_1.scopeLiveByBranch)(live, scope, scopedClassified), (0, scope_by_branch_1.scopeOperationalByBranch)(operational, scope, scopedClassified), (0, scope_by_branch_1.scopeDecisionsByBranch)(decisions, scope), scopedClassified, null);
        return this.dashboard.compose(scopedClassified, scopedExecutive, branchLedger);
    }
    async getLive(user) {
        const scope = this.managerBranchId(user);
        if (!scope)
            return this.monitor.getLive();
        const live = await this.monitor.getLive();
        const scopedClassified = (0, scope_by_branch_1.scopeClassifiedByBranch)(await this.monitor.getClassified(), scope);
        return (0, scope_by_branch_1.scopeLiveByBranch)(live, scope, scopedClassified);
    }
    async getOperational(user) {
        const scope = this.managerBranchId(user);
        if (!scope)
            return this.monitor.getOperationalView();
        const view = await this.monitor.getOperationalView();
        const scopedClassified = (0, scope_by_branch_1.scopeClassifiedByBranch)(await this.monitor.getClassified(), scope);
        return (0, scope_by_branch_1.scopeOperationalByBranch)(view, scope, scopedClassified);
    }
    async getDecisions(user) {
        const res = await this.decisions.getDecisions();
        const scope = this.managerBranchId(user);
        return scope ? (0, scope_by_branch_1.scopeDecisionsByBranch)(res, scope) : res;
    }
    async getExecutive(user) {
        const scope = this.managerBranchId(user);
        if (!scope)
            return this.executive.getExecutiveView();
        const live = await this.monitor.getLive();
        const [operational, decisions, classified] = await Promise.all([
            this.monitor.getOperationalView(),
            this.decisions.getDecisions(),
            this.monitor.getClassified(),
        ]);
        const scopedClassified = (0, scope_by_branch_1.scopeClassifiedByBranch)(classified, scope);
        return await this.executive.compose((0, scope_by_branch_1.scopeLiveByBranch)(live, scope, scopedClassified), (0, scope_by_branch_1.scopeOperationalByBranch)(operational, scope, scopedClassified), (0, scope_by_branch_1.scopeDecisionsByBranch)(decisions, scope), scopedClassified, null);
    }
    async getRisk(user) {
        const res = await this.risk.computeRisk();
        const scope = this.managerBranchId(user);
        if (!scope)
            return res;
        const scopedClassified = (0, scope_by_branch_1.scopeClassifiedByBranch)(await this.monitor.getClassified(), scope);
        return (0, scope_by_branch_1.scopeRiskByBranch)(res, scope, scopedClassified);
    }
    async getClassified(user) {
        const res = await this.classifier.classify();
        const scope = this.managerBranchId(user);
        return scope ? (0, scope_by_branch_1.scopeClassifiedByBranch)(res, scope) : res;
    }
    async getExplain(user) {
        const res = await this.explain.getExplain();
        const scope = this.managerBranchId(user);
        if (!scope)
            return res;
        const scopedClassified = (0, scope_by_branch_1.scopeClassifiedByBranch)(await this.monitor.getClassified(), scope);
        return (0, scope_by_branch_1.scopeExplainByBranch)(res, scope, scopedClassified);
    }
    async recordAction(body, user) {
        let allowed;
        const scope = this.managerBranchId(user);
        if (scope) {
            const scopedClassified = (0, scope_by_branch_1.scopeClassifiedByBranch)(await this.monitor.getClassified(), scope);
            const op = (0, scope_by_branch_1.scopeOperationalByBranch)(await this.monitor.getOperationalView(), scope, scopedClassified);
            const ids = new Set();
            for (const d of op.activeDrivers)
                ids.add(d.driverId);
            for (const d of op.driversAtRisk)
                ids.add(d.driverId);
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
    async getExposure(user) {
        if (user.role === client_1.SafariRole.MANAGER) {
            throw new common_1.ForbiddenException('Driver exposure is restricted to OWNER, GENERAL_MANAGER, and ACCOUNTANT.');
        }
        return this.exposure.computeExposure();
    }
    async verifySystem(user) {
        if (user.role !== client_1.SafariRole.OWNER &&
            user.role !== client_1.SafariRole.GENERAL_MANAGER) {
            throw new common_1.ForbiddenException('System verification is restricted to OWNER and GENERAL_MANAGER.');
        }
        return this.verify.run();
    }
    async runIntegrityAudit(user) {
        if (user.role !== client_1.SafariRole.OWNER &&
            user.role !== client_1.SafariRole.GENERAL_MANAGER) {
            throw new common_1.ForbiddenException('Integrity audit is restricted to OWNER and GENERAL_MANAGER.');
        }
        return this.integrity.run();
    }
    async runDriverAmountAudit(user) {
        if (user.role !== client_1.SafariRole.OWNER &&
            user.role !== client_1.SafariRole.GENERAL_MANAGER) {
            throw new common_1.ForbiddenException('Driver-amount audit is restricted to OWNER and GENERAL_MANAGER.');
        }
        return this.driverAmountAudit.run();
    }
    async runRoleConsistencyAudit(user) {
        if (user.role !== client_1.SafariRole.OWNER &&
            user.role !== client_1.SafariRole.GENERAL_MANAGER) {
            throw new common_1.ForbiddenException('Role-consistency audit is restricted to OWNER and GENERAL_MANAGER.');
        }
        return this.roleConsistency.run();
    }
    managerBranchId(user) {
        if (user.role !== client_1.SafariRole.MANAGER)
            return null;
        if (!user.branchId) {
            throw new common_1.ForbiddenException('Manager has no branchId on JWT — cannot scope cash monitor view.');
        }
        return user.branchId;
    }
};
exports.CashMonitorController = CashMonitorController;
__decorate([
    (0, common_1.Get)('dashboard'),
    (0, swagger_1.ApiOkResponse)({ type: cash_dashboard_dto_1.CashDashboardResponseDto }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CashMonitorController.prototype, "getDashboard", null);
__decorate([
    (0, common_1.Get)('live'),
    (0, swagger_1.ApiOkResponse)({ type: cash_monitor_dto_1.CashMonitorLiveDto }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CashMonitorController.prototype, "getLive", null);
__decorate([
    (0, common_1.Get)('operational'),
    (0, swagger_1.ApiOkResponse)({ type: cash_monitor_operational_dto_1.OperationalLiveDto }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CashMonitorController.prototype, "getOperational", null);
__decorate([
    (0, common_1.Get)('decisions'),
    (0, swagger_1.ApiOkResponse)({ type: cash_decision_dto_1.CashDecisionsResponseDto }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CashMonitorController.prototype, "getDecisions", null);
__decorate([
    (0, common_1.Get)('executive'),
    (0, swagger_1.ApiOkResponse)({ type: cash_executive_dto_1.CashExecutiveResponseDto }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CashMonitorController.prototype, "getExecutive", null);
__decorate([
    (0, common_1.Get)('risk'),
    (0, swagger_1.ApiOkResponse)({ type: cash_risk_dto_1.CashRiskResponseDto }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CashMonitorController.prototype, "getRisk", null);
__decorate([
    (0, common_1.Get)('classified'),
    (0, swagger_1.ApiOkResponse)({ type: cash_classified_dto_1.CashClassifiedResponseDto }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CashMonitorController.prototype, "getClassified", null);
__decorate([
    (0, common_1.Get)('explain'),
    (0, swagger_1.ApiOkResponse)({ type: cash_explain_dto_1.CashExplainResponseDto }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CashMonitorController.prototype, "getExplain", null);
__decorate([
    (0, common_1.Post)('action'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOkResponse)({ type: cash_execution_dto_1.CashExecutionActionResponseDto }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [cash_execution_dto_1.CashExecutionActionRequestDto, Object]),
    __metadata("design:returntype", Promise)
], CashMonitorController.prototype, "recordAction", null);
__decorate([
    (0, common_1.Get)('exposure'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOkResponse)({ type: cash_exposure_dto_1.CashExposureResponseDto }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CashMonitorController.prototype, "getExposure", null);
__decorate([
    (0, common_1.Get)('verify'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOkResponse)({ type: system_verify_dto_1.SystemVerifyResponseDto }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CashMonitorController.prototype, "verifySystem", null);
__decorate([
    (0, common_1.Get)('integrity-audit'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOkResponse)({ type: integrity_audit_dto_1.IntegrityAuditResponseDto }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CashMonitorController.prototype, "runIntegrityAudit", null);
__decorate([
    (0, common_1.Get)('driver-amount-audit'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOkResponse)({ type: driver_amount_audit_dto_1.DriverAmountAuditResponseDto }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CashMonitorController.prototype, "runDriverAmountAudit", null);
__decorate([
    (0, common_1.Get)('role-consistency-audit'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CashMonitorController.prototype, "runRoleConsistencyAudit", null);
exports.CashMonitorController = CashMonitorController = __decorate([
    (0, swagger_1.ApiTags)('cash-intelligence'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('cash-intelligence'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.MANAGER),
    (0, permissions_decorator_1.Permissions)(permissions_enum_1.AppPermission.VIEW_CASH),
    __metadata("design:paramtypes", [cash_monitor_service_1.CashMonitorService,
        cash_decision_service_1.CashDecisionService,
        cash_executive_service_1.CashExecutiveService,
        cash_execution_tracker_service_1.CashExecutionTrackerService,
        cash_risk_service_1.CashRiskService,
        cash_classifier_service_1.CashClassifierService,
        cash_exposure_service_1.CashExposureService,
        system_verify_service_1.SystemVerifyService,
        integrity_audit_service_1.IntegrityAuditService,
        driver_amount_audit_service_1.DriverAmountAuditService,
        cash_explain_service_1.CashExplainService,
        cash_dashboard_service_1.CashDashboardService,
        branch_cash_ledger_service_1.BranchCashLedgerService,
        role_consistency_service_1.RoleConsistencyService])
], CashMonitorController);
//# sourceMappingURL=cash-monitor.controller.js.map