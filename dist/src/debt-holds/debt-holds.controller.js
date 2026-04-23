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
exports.DebtHoldsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const debt_holds_service_1 = require("./debt-holds.service");
const create_manual_hold_dto_1 = require("./dto/create-manual-hold.dto");
const list_debt_holds_dto_1 = require("./dto/list-debt-holds.dto");
let DebtHoldsController = class DebtHoldsController {
    service;
    constructor(service) {
        this.service = service;
    }
    list(q, user) {
        return this.service.list(user.role, user.userId, q);
    }
    preview(employeeUserId, user) {
        return this.service.previewForEmployee(user.role, employeeUserId);
    }
    createManual(dto, user) {
        return this.service.createManualHold(user.role, dto);
    }
    release(id, user) {
        return this.service.releaseManualHold(user.role, id);
    }
    disburse(id, user) {
        return this.service.markDisbursed(user.role, user.userId, id);
    }
};
exports.DebtHoldsController = DebtHoldsController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.MANAGER, client_1.SafariRole.DRIVER, client_1.SafariRole.CALL_CENTER, client_1.SafariRole.CALL_CENTER_SUPERVISOR, client_1.SafariRole.SUPERVISOR, client_1.SafariRole.VIEWER),
    (0, swagger_1.ApiOperation)({
        summary: `List debt holds (${branding_1.APP_BRAND})`,
        description: 'Admin roles see everyone; employees only their own holds.',
    }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [list_debt_holds_dto_1.ListDebtHoldsDto, Object]),
    __metadata("design:returntype", void 0)
], DebtHoldsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('preview/:employeeUserId'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Preview the debt-hold slip for an employee (${branding_1.APP_BRAND})`,
    }),
    __param(0, (0, common_1.Param)('employeeUserId', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], DebtHoldsController.prototype, "preview", null);
__decorate([
    (0, common_1.Post)('manual'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Create a manual debt hold (${branding_1.APP_BRAND})`,
        description: 'OWNER + GENERAL_MANAGER only. Withholds a one-off amount from the employee outside the automatic open-customer-debt computation.',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_manual_hold_dto_1.CreateManualHoldDto, Object]),
    __metadata("design:returntype", void 0)
], DebtHoldsController.prototype, "createManual", null);
__decorate([
    (0, common_1.Post)(':id/release'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Force-release a debt hold (${branding_1.APP_BRAND})`,
        description: 'OWNER + GENERAL_MANAGER only. V19.17: flips the hold to RELEASED, marking it as eligible for a SEPARATE voucher payout (no longer bundled into the next payroll).',
    }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], DebtHoldsController.prototype, "release", null);
__decorate([
    (0, common_1.Post)(':id/disburse'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Stamp a released hold as disbursed (${branding_1.APP_BRAND})`,
        description: 'OWNER + GENERAL_MANAGER only. V19.17: records that the RELEASED hold has actually been paid out to the employee as a standalone voucher, setting `disbursedAt` + `disbursedById`.',
    }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], DebtHoldsController.prototype, "disburse", null);
exports.DebtHoldsController = DebtHoldsController = __decorate([
    (0, swagger_1.ApiTags)('debt-holds'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('debt-holds'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [debt_holds_service_1.DebtHoldsService])
], DebtHoldsController);
//# sourceMappingURL=debt-holds.controller.js.map