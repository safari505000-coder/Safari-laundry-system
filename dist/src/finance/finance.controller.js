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
exports.FinanceController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const confirm_handover_dto_1 = require("./dto/confirm-handover.dto");
const daily_pos_sales_query_dto_1 = require("./dto/daily-pos-sales-query.dto");
const finance_service_1 = require("./finance.service");
let FinanceController = class FinanceController {
    financeService;
    constructor(financeService) {
        this.financeService = financeService;
    }
    async driverEnsureShift(user) {
        await this.financeService.ensureOpenShiftForDriver(user.userId);
        return { ok: true };
    }
    getOwnerCustomerWalletSummary() {
        return this.financeService.getOwnerCustomerWalletSummary();
    }
    getDailyPosSales(q) {
        return this.financeService.getDailyPosSalesByPaymentMethod(q.from, q.to);
    }
    getDriverBalance() {
        return this.financeService.getDriverBalances();
    }
    confirmHandover(dto, user) {
        return this.financeService.confirmHandover(user.userId, dto);
    }
};
exports.FinanceController = FinanceController;
__decorate([
    (0, common_1.Post)('driver/ensure-shift'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.DRIVER),
    (0, swagger_1.ApiOperation)({
        summary: `Driver — ensure open shift (auto-rollover) (${branding_1.APP_BRAND})`,
        description: 'Driver-only. Ensures exactly one OPEN shift and auto-locks yesterday shift at 23:59:59 Kuwait when crossing midnight.',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], FinanceController.prototype, "driverEnsureShift", null);
__decorate([
    (0, common_1.Get)('owner/customer-wallet-summary'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER),
    (0, swagger_1.ApiOperation)({
        summary: `Owner — customer wallet liabilities & debts (${branding_1.APP_BRAND})`,
        description: 'OWNER only. Aggregates CustomerWallet balance (prepaid credit owed) and debt across all customers.',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], FinanceController.prototype, "getOwnerCustomerWalletSummary", null);
__decorate([
    (0, common_1.Get)('reports/daily-pos-sales'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.SUPERVISOR),
    (0, swagger_1.ApiOperation)({
        summary: `Daily POS sales by payment method (${branding_1.APP_BRAND})`,
        description: 'Aggregates completed POS orders with recorded PosPaymentMethod (subscription wallet, cash, KNET, payment link) for financial reporting.',
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [daily_pos_sales_query_dto_1.DailyPosSalesQueryDto]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "getDailyPosSales", null);
__decorate([
    (0, common_1.Get)('driver-balance'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.SUPERVISOR, client_1.SafariRole.VIEWER),
    (0, swagger_1.ApiOperation)({
        summary: `Driver cash on hand (${branding_1.APP_BRAND})`,
        description: 'Per driver: sum of COMPLETED orders still PAID_TO_DRIVER (not yet handed to office), plus current OPEN shift metadata. OWNER/MANAGER only.',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], FinanceController.prototype, "getDriverBalance", null);
__decorate([
    (0, common_1.Post)('handover/confirm'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.MANAGER, client_1.SafariRole.SUPERVISOR),
    (0, swagger_1.ApiOperation)({
        summary: `Confirm cash handover (${branding_1.APP_BRAND})`,
        description: 'Atomic settlement: all PAID_TO_DRIVER orders for the driver → HANDED_OVER_TO_OFFICE; OPEN shift → CLOSED with ledger totals. Optional declaredHandoverTotal must match ledger within 0.0001 KWD.',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [confirm_handover_dto_1.ConfirmHandoverDto, Object]),
    __metadata("design:returntype", Promise)
], FinanceController.prototype, "confirmHandover", null);
exports.FinanceController = FinanceController = __decorate([
    (0, swagger_1.ApiTags)('finance'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('finance'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [finance_service_1.FinanceService])
], FinanceController);
//# sourceMappingURL=finance.controller.js.map