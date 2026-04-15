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
exports.FixedExpenseController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const create_fixed_expense_dto_1 = require("./dto/create-fixed-expense.dto");
const fixed_expense_service_1 = require("./fixed-expense.service");
let FixedExpenseController = class FixedExpenseController {
    fixedExpenseService;
    constructor(fixedExpenseService) {
        this.fixedExpenseService = fixedExpenseService;
    }
    create(dto, user) {
        return this.fixedExpenseService.create(user.role, dto);
    }
    list(branchId) {
        return this.fixedExpenseService.list(branchId);
    }
};
exports.FixedExpenseController = FixedExpenseController;
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Create recurring fixed expense schedule (${branding_1.APP_BRAND})`,
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_fixed_expense_dto_1.CreateFixedExpenseDto, Object]),
    __metadata("design:returntype", void 0)
], FixedExpenseController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.SUPERVISOR, client_1.SafariRole.VIEWER),
    (0, swagger_1.ApiOperation)({ summary: `List fixed expense schedules (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Query)('branchId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], FixedExpenseController.prototype, "list", null);
exports.FixedExpenseController = FixedExpenseController = __decorate([
    (0, swagger_1.ApiTags)('fixed-expenses'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('fixed-expenses'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [fixed_expense_service_1.FixedExpenseService])
], FixedExpenseController);
//# sourceMappingURL=fixed-expense.controller.js.map