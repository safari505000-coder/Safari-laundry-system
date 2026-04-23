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
exports.ManagerDocumentsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const manager_documents_service_1 = require("./manager-documents.service");
let ManagerDocumentsController = class ManagerDocumentsController {
    svc;
    constructor(svc) {
        this.svc = svc;
    }
    list(user) {
        return this.svc.listForManager(user.userId, user.branchId);
    }
    async getExpenseVoucher(id, user) {
        const row = await this.svc.getExpenseVoucherForManager(id, user.userId, user.branchId);
        if (!row) {
            throw new common_1.NotFoundException('Voucher not found or you do not have access.');
        }
        return {
            id: row.id,
            title: row.title,
            amountKd: row.amount.toString(),
            category: row.category,
            expenseMethod: row.expenseMethod,
            note: row.note,
            expenseDate: row.expenseDate.toISOString(),
            approvedAt: row.updatedAt.toISOString(),
            status: row.status,
            recordedBy: {
                id: row.recordedBy.id,
                fullName: row.recordedBy.fullName,
                username: row.recordedBy.username,
            },
            branch: row.branch ? { id: row.branch.id, name: row.branch.name } : null,
        };
    }
};
exports.ManagerDocumentsController = ManagerDocumentsController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Branch Manager — my documents (${branding_1.APP_BRAND})`,
        description: 'Unified chronological feed of Accountant-approved documents owned by the signed-in manager: CUSTODY_RECEIPT (VERIFIED cash-handover bags) + EXPENSE_VOUCHER (APPROVED branch expenses attached to this manager or their branch). Each row carries a `printPath` the FE navigates to for the printable document.',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ManagerDocumentsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('expense/:id'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Branch Manager — expense voucher (${branding_1.APP_BRAND})`,
        description: 'Fetch a single APPROVED BranchExpense row for the printable voucher. The manager must either be the original submitter OR the expense must be booked on their branch; otherwise 404 is returned.',
    }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ManagerDocumentsController.prototype, "getExpenseVoucher", null);
exports.ManagerDocumentsController = ManagerDocumentsController = __decorate([
    (0, swagger_1.ApiTags)('manager-documents'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('manager/my-documents'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [manager_documents_service_1.ManagerDocumentsService])
], ManagerDocumentsController);
//# sourceMappingURL=manager-documents.controller.js.map