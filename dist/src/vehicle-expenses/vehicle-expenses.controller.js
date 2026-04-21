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
exports.VehicleExpensesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const create_vehicle_expense_dto_1 = require("./dto/create-vehicle-expense.dto");
const update_vehicle_expense_status_dto_1 = require("./dto/update-vehicle-expense-status.dto");
const vehicle_expenses_query_dto_1 = require("./dto/vehicle-expenses-query.dto");
const vehicle_expenses_service_1 = require("./vehicle-expenses.service");
let VehicleExpensesController = class VehicleExpensesController {
    service;
    constructor(service) {
        this.service = service;
    }
    create(dto, user) {
        return this.service.create(user.userId, user.role, dto);
    }
    list(q, user) {
        return this.service.listForUser(user.userId, user.role, q);
    }
    listPendingApproval(user) {
        return this.service.listPendingApproval(user.role);
    }
    report(from, to, user) {
        return this.service.getReport(user.role, { from, to });
    }
    updateStatus(id, dto, user) {
        return this.service.updateStatus(id, user.role, user.userId, dto);
    }
};
exports.VehicleExpensesController = VehicleExpensesController;
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.FLEET_SUPERVISOR),
    (0, swagger_1.ApiOperation)({
        summary: `Submit a vehicle expense (${branding_1.APP_BRAND})`,
        description: 'Fleet Supervisor only. Receipt photo is MANDATORY. Row starts at PENDING_ACCOUNTANT.',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_vehicle_expense_dto_1.CreateVehicleExpenseDto, Object]),
    __metadata("design:returntype", void 0)
], VehicleExpensesController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.FLEET_SUPERVISOR, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `List vehicle expenses (${branding_1.APP_BRAND})`,
        description: 'Fleet Supervisor sees only own rows; Accountant / Owner / GM see all.',
    }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [vehicle_expenses_query_dto_1.VehicleExpensesQueryDto, Object]),
    __metadata("design:returntype", void 0)
], VehicleExpensesController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('pending-approval'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({ summary: `Pending vehicle-expense queue (${branding_1.APP_BRAND})` }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], VehicleExpensesController.prototype, "listPendingApproval", null);
__decorate([
    (0, common_1.Get)('report'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({ summary: `Aggregated vehicle-expense report (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Query)('from')),
    __param(1, (0, common_1.Query)('to')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], VehicleExpensesController.prototype, "report", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({
        summary: `Approve / reject a vehicle expense (${branding_1.APP_BRAND})`,
        description: 'Accountant only. REJECTED requires a reason.',
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_vehicle_expense_status_dto_1.UpdateVehicleExpenseStatusDto, Object]),
    __metadata("design:returntype", void 0)
], VehicleExpensesController.prototype, "updateStatus", null);
exports.VehicleExpensesController = VehicleExpensesController = __decorate([
    (0, swagger_1.ApiTags)('vehicle-expenses'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('vehicle-expenses'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [vehicle_expenses_service_1.VehicleExpensesService])
], VehicleExpensesController);
//# sourceMappingURL=vehicle-expenses.controller.js.map