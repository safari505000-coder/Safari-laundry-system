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
exports.DebtTransfersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const debt_transfers_service_1 = require("./debt-transfers.service");
const cancel_debt_transfer_dto_1 = require("./dto/cancel-debt-transfer.dto");
const create_debt_transfer_dto_1 = require("./dto/create-debt-transfer.dto");
const list_debt_transfers_dto_1 = require("./dto/list-debt-transfers.dto");
let DebtTransfersController = class DebtTransfersController {
    service;
    constructor(service) {
        this.service = service;
    }
    list(query) {
        return this.service.list(query);
    }
    mine(user) {
        return this.service.listMine(user.userId);
    }
    listDrivers() {
        return this.service.listDrivers();
    }
    outstanding(driverId) {
        return this.service.getDriverOutstandingOrders(driverId);
    }
    async findOne(id, user) {
        const transfer = await this.service.findOne(id);
        if (user.role === client_1.SafariRole.DRIVER) {
            if (transfer.sourceDriver?.id !== user.userId &&
                transfer.targetDriver?.id !== user.userId) {
                throw new (await import('@nestjs/common')).NotFoundException('Debt transfer not found.');
            }
        }
        return transfer;
    }
    create(dto, user) {
        return this.service.create(user.userId, user.role, dto);
    }
    finalize(id, user) {
        return this.service.finalize(id, user.userId, user.role);
    }
    cancel(id, dto, user) {
        return this.service.cancel(id, user.userId, user.role, dto.reason ?? null);
    }
    signSource(id, user) {
        return this.service.signAsSource(id, user.userId);
    }
    signTarget(id, user) {
        return this.service.signAsTarget(id, user.userId);
    }
};
exports.DebtTransfersController = DebtTransfersController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({
        summary: 'List debt transfers with filtering (OWNER read-only, GM/ACC full).',
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [list_debt_transfers_dto_1.ListDebtTransfersDto]),
    __metadata("design:returntype", void 0)
], DebtTransfersController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('mine'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.DRIVER),
    (0, swagger_1.ApiOperation)({
        summary: 'Driver-facing view: transfers where I am source or target.',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DebtTransfersController.prototype, "mine", null);
__decorate([
    (0, common_1.Get)('drivers'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({
        summary: 'Active DRIVER roster (for source/target pickers).',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], DebtTransfersController.prototype, "listDrivers", null);
__decorate([
    (0, common_1.Get)('drivers/:driverId/outstanding'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({
        summary: 'List a driver\'s outstanding PAID_TO_DRIVER orders (transfer candidates).',
    }),
    __param(0, (0, common_1.Param)('driverId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], DebtTransfersController.prototype, "outstanding", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.DRIVER),
    (0, swagger_1.ApiOperation)({
        summary: 'Get a debt transfer by id. Driver can only read their own transfers.',
    }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], DebtTransfersController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new debt transfer (GM or ACCOUNTANT only).' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_debt_transfer_dto_1.CreateDebtTransferDto, Object]),
    __metadata("design:returntype", void 0)
], DebtTransfersController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':id/finalize'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({
        summary: 'Finalize a debt transfer (requires both driver signatures).',
    }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], DebtTransfersController.prototype, "finalize", null);
__decorate([
    (0, common_1.Post)(':id/cancel'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({ summary: 'Cancel a DRAFT or AWAITING_SIGNATURES debt transfer.' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, cancel_debt_transfer_dto_1.CancelDebtTransferDto, Object]),
    __metadata("design:returntype", void 0)
], DebtTransfersController.prototype, "cancel", null);
__decorate([
    (0, common_1.Post)(':id/sign/source'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.DRIVER),
    (0, swagger_1.ApiOperation)({
        summary: 'Source driver signs (acknowledges releasing the debt to the target).',
    }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], DebtTransfersController.prototype, "signSource", null);
__decorate([
    (0, common_1.Post)(':id/sign/target'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.DRIVER),
    (0, swagger_1.ApiOperation)({
        summary: 'Target driver signs (accepts receipt of the debt).',
    }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], DebtTransfersController.prototype, "signTarget", null);
exports.DebtTransfersController = DebtTransfersController = __decorate([
    (0, swagger_1.ApiTags)('debt-transfers'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('debt-transfers'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [debt_transfers_service_1.DebtTransfersService])
], DebtTransfersController);
//# sourceMappingURL=debt-transfers.controller.js.map