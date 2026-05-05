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
exports.ExpensesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const permissions_decorator_1 = require("../auth/permissions/permissions.decorator");
const permissions_enum_1 = require("../auth/permissions/permissions.enum");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const audit_service_1 = require("../common/audit/audit.service");
const create_expense_dto_1 = require("./dto/create-expense.dto");
const expenses_service_1 = require("./expenses.service");
const expenses_query_dto_1 = require("./dto/expenses-query.dto");
const update_expense_status_dto_1 = require("./dto/update-expense-status.dto");
let ExpensesController = class ExpensesController {
    expensesService;
    audit;
    constructor(expensesService, audit) {
        this.expensesService = expensesService;
        this.audit = audit;
    }
    create(dto, user) {
        return this.expensesService.create(user.userId, user.role, dto);
    }
    list(q, user) {
        return this.expensesService.listForUser(user.userId, user.role, q.from, q.to, q.branchId, q.status);
    }
    listPendingApproval(user) {
        return this.expensesService.listPendingApproval(user.role);
    }
    updateStatus(id, dto, user) {
        this.audit.logAudit('EXPENSE_APPROVAL_DECISION', user, {
            expenseId: id,
            status: dto.status,
        });
        return this.expensesService.updateStatus(id, user.role, dto.status, user.userId);
    }
};
exports.ExpensesController = ExpensesController;
__decorate([
    (0, common_1.Post)(),
    (0, permissions_decorator_1.Permissions)(permissions_enum_1.AppPermission.CREATE_EXPENSES),
    (0, swagger_1.ApiOperation)({
        summary: `Record branch expense (${branding_1.APP_BRAND})`,
        description: 'MANAGER or DRIVER (field). Categories: SOAP, FUEL, MISC. New rows are PENDING_ACCOUNTANT until approved.',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_expense_dto_1.CreateExpenseDto, Object]),
    __metadata("design:returntype", void 0)
], ExpensesController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, permissions_decorator_1.Permissions)(permissions_enum_1.AppPermission.VIEW_EXPENSES),
    (0, swagger_1.ApiOperation)({
        summary: `List expenses in date range (${branding_1.APP_BRAND})`,
    }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [expenses_query_dto_1.ExpensesQueryDto, Object]),
    __metadata("design:returntype", void 0)
], ExpensesController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('pending-approval'),
    (0, permissions_decorator_1.Permissions)(permissions_enum_1.AppPermission.APPROVE_EXPENSES),
    (0, swagger_1.ApiOperation)({
        summary: `Pending expense approvals (${branding_1.APP_BRAND})`,
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ExpensesController.prototype, "listPendingApproval", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    (0, permissions_decorator_1.Permissions)(permissions_enum_1.AppPermission.APPROVE_EXPENSES),
    (0, swagger_1.ApiOperation)({
        summary: `Approve/Reject/Audit expense (${branding_1.APP_BRAND})`,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_expense_status_dto_1.UpdateExpenseStatusDto, Object]),
    __metadata("design:returntype", void 0)
], ExpensesController.prototype, "updateStatus", null);
exports.ExpensesController = ExpensesController = __decorate([
    (0, swagger_1.ApiTags)('expenses'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('expenses'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [expenses_service_1.ExpensesService,
        audit_service_1.AuditService])
], ExpensesController);
//# sourceMappingURL=expenses.controller.js.map