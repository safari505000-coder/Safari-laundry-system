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
const create_payroll_adhoc_line_dto_1 = require("./dto/create-payroll-adhoc-line.dto");
const create_payroll_dto_1 = require("./dto/create-payroll.dto");
const payroll_query_dto_1 = require("./dto/payroll-query.dto");
const update_payroll_adhoc_line_dto_1 = require("./dto/update-payroll-adhoc-line.dto");
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
    recalcLoan(id, user) {
        return this.payrollService.recalcLoanDeduction(user.role, id);
    }
    list(q, user) {
        return this.payrollService.list(user.role, q.from, q.to, q.branchId);
    }
    listAdHoc(ym, branchId, user) {
        return this.payrollService.listAdHocLines(user.role, ym, branchId);
    }
    createAdHoc(dto, user) {
        return this.payrollService.createAdHocLine(user.role, dto);
    }
    updateAdHoc(id, dto, user) {
        return this.payrollService.updateAdHocLine(user.role, id, dto);
    }
    removeAdHoc(id, user) {
        return this.payrollService.deleteAdHocLine(user.role, id);
    }
    findOne(id, user) {
        return this.payrollService.findOne(user.role, user.userId, id);
    }
};
exports.PayrollController = PayrollController;
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiOperation)({ summary: `Create payroll line (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_payroll_dto_1.CreatePayrollDto, Object]),
    __metadata("design:returntype", void 0)
], PayrollController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id/mark-paid'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiOperation)({ summary: `Mark payroll as paid (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PayrollController.prototype, "markPaid", null);
__decorate([
    (0, common_1.Post)(':id/recalc-loan'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Recalculate loan instalment for a pending payroll (${branding_1.APP_BRAND})`,
        description: 'Pulls the scheduled monthly instalment(s) into this payroll row for loans that have never been consumed by a payroll. Only touches PENDING rows.',
    }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PayrollController.prototype, "recalcLoan", null);
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
__decorate([
    (0, common_1.Get)('adhoc-lines'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({ summary: `List manual payroll roster lines for YYYY-MM` }),
    __param(0, (0, common_1.Query)('ym')),
    __param(1, (0, common_1.Query)('branchId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], PayrollController.prototype, "listAdHoc", null);
__decorate([
    (0, common_1.Post)('adhoc-lines'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiOperation)({ summary: `Create manual payroll roster line` }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_payroll_adhoc_line_dto_1.CreatePayrollAdhocLineDto, Object]),
    __metadata("design:returntype", void 0)
], PayrollController.prototype, "createAdHoc", null);
__decorate([
    (0, common_1.Patch)('adhoc-lines/:id'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiOperation)({ summary: `Update manual payroll roster line` }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_payroll_adhoc_line_dto_1.UpdatePayrollAdhocLineDto, Object]),
    __metadata("design:returntype", void 0)
], PayrollController.prototype, "updateAdHoc", null);
__decorate([
    (0, common_1.Delete)('adhoc-lines/:id'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiOperation)({ summary: `Delete manual payroll roster line` }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PayrollController.prototype, "removeAdHoc", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.DRIVER, client_1.SafariRole.CALL_CENTER, client_1.SafariRole.CALL_CENTER_SUPERVISOR, client_1.SafariRole.SUPERVISOR, client_1.SafariRole.VIEWER),
    (0, swagger_1.ApiOperation)({
        summary: `Fetch a single payroll row for the A4 payslip (${branding_1.APP_BRAND})`,
        description: 'Stage-D — used by the printable payslip. Non-admin roles can only fetch their own payroll rows.',
    }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PayrollController.prototype, "findOne", null);
exports.PayrollController = PayrollController = __decorate([
    (0, swagger_1.ApiTags)('payroll'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('payroll'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [payroll_service_1.PayrollService])
], PayrollController);
//# sourceMappingURL=payroll.controller.js.map