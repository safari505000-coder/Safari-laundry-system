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
exports.SystemGuardianController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const system_guardian_service_1 = require("./system-guardian.service");
const integrity_audit_service_1 = require("../cash-monitor/integrity-audit.service");
const driver_amount_audit_service_1 = require("../cash-monitor/driver-amount-audit.service");
const diagnostics_engine_service_1 = require("../cash-monitor/diagnostics-engine.service");
const system_guardian_dto_1 = require("./dto/system-guardian.dto");
const diagnostics_dto_1 = require("../cash-monitor/dto/diagnostics.dto");
let SystemGuardianController = class SystemGuardianController {
    guardian;
    integrity;
    driverAmount;
    diagnostics;
    constructor(guardian, integrity, driverAmount, diagnostics) {
        this.guardian = guardian;
        this.integrity = integrity;
        this.driverAmount = driverAmount;
        this.diagnostics = diagnostics;
    }
    async status(user) {
        this.assertOwnerTier(user);
        return this.guardian.status();
    }
    async run(user) {
        this.assertOwnerTier(user);
        return this.guardian.runOnce();
    }
    async runDiagnostics(user) {
        this.assertOwnerTier(user);
        const [integrity, drivers, guardian] = await Promise.all([
            this.integrity.run(),
            this.driverAmount.run(),
            this.guardian.status(),
        ]);
        return this.diagnostics.compose({ guardian, integrity, drivers });
    }
    assertOwnerTier(user) {
        if (user.role !== client_1.SafariRole.OWNER &&
            user.role !== client_1.SafariRole.GENERAL_MANAGER) {
            throw new common_1.ForbiddenException('System Guardian is restricted to OWNER and GENERAL_MANAGER.');
        }
    }
};
exports.SystemGuardianController = SystemGuardianController;
__decorate([
    (0, common_1.Get)('status'),
    (0, swagger_1.ApiOkResponse)({ type: system_guardian_dto_1.GuardianStatusResponseDto }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SystemGuardianController.prototype, "status", null);
__decorate([
    (0, common_1.Post)('run'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOkResponse)({ type: system_guardian_dto_1.GuardianResponseDto }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SystemGuardianController.prototype, "run", null);
__decorate([
    (0, common_1.Get)('diagnostics'),
    (0, swagger_1.ApiOkResponse)({ type: diagnostics_dto_1.DiagnosticsResponseDto }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SystemGuardianController.prototype, "runDiagnostics", null);
exports.SystemGuardianController = SystemGuardianController = __decorate([
    (0, swagger_1.ApiTags)('system-guardian'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('system-guardian'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    __metadata("design:paramtypes", [system_guardian_service_1.SystemGuardianService,
        integrity_audit_service_1.IntegrityAuditService,
        driver_amount_audit_service_1.DriverAmountAuditService,
        diagnostics_engine_service_1.DiagnosticsEngineService])
], SystemGuardianController);
//# sourceMappingURL=system-guardian.controller.js.map