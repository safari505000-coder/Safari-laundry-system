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
exports.PayrollController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const create_payroll_dto_1 = require("./dto/create-payroll.dto");
const payroll_query_dto_1 = require("./dto/payroll-query.dto");
const payroll_service_1 = require("./payroll.service");
let PayrollController = class PayrollController {
    payrollService;
    constructor(payrollService) {
        this.payrollService = payrollService;
    }
    create(dto, user) {
        return this.payrollService.create(user.role, dto);
    }
    markPaid(id, user) {
        return this.payrollService.markPaid(user.role, id);
    }
    list(q, user) {
        return this.payrollService.list(user.role, q.from, q.to, q.branchId);
    }
};
exports.PayrollController = PayrollController;
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiOperation)({ summary: `Create payroll line (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_payroll_dto_1.CreatePayrollDto, Object]),
    __metadata("design:returntype", void 0)
], PayrollController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id/mark-paid'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiOperation)({ summary: `Mark payroll as paid (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PayrollController.prototype, "markPaid", null);
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({ summary: `List payroll in date range (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [payroll_query_dto_1.PayrollQueryDto, Object]),
    __metadata("design:returntype", void 0)
], PayrollController.prototype, "list", null);
exports.PayrollController = PayrollController = __decorate([
    (0, swagger_1.ApiTags)('payroll'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('payroll'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [payroll_service_1.PayrollService])
], PayrollController);
//# sourceMappingURL=payroll.controller.js.map