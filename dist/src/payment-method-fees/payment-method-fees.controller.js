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
exports.PaymentMethodFeesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const update_payment_method_fees_dto_1 = require("./dto/update-payment-method-fees.dto");
const payment_method_fees_service_1 = require("./payment-method-fees.service");
const prisma_service_1 = require("../prisma/prisma.service");
let PaymentMethodFeesController = class PaymentMethodFeesController {
    feesService;
    prisma;
    constructor(feesService, prisma) {
        this.feesService = feesService;
        this.prisma = prisma;
    }
    async getConfig() {
        return this.feesService.getConfig();
    }
    async patch(dto) {
        await this.feesService.ensureDefaultRow();
        const data = {};
        if (dto.knetFlatKd !== undefined)
            data.knetFlatKd = dto.knetFlatKd;
        if (dto.knetPercentOfGross !== undefined) {
            data.knetPercentOfGross = dto.knetPercentOfGross;
        }
        if (dto.knetRule !== undefined)
            data.knetRule = dto.knetRule;
        if (dto.cardPercentOfGross !== undefined) {
            data.cardPercentOfGross = dto.cardPercentOfGross;
        }
        return this.prisma.paymentMethodFeeConfig.update({
            where: { id: 'default' },
            data,
        });
    }
};
exports.PaymentMethodFeesController = PaymentMethodFeesController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.SUPERVISOR),
    (0, swagger_1.ApiOperation)({
        summary: `Read global payment-method fee config (${branding_1.APP_BRAND})`,
        description: 'Used for reporting-layer bank commission on non-cash electronic settlements.',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PaymentMethodFeesController.prototype, "getConfig", null);
__decorate([
    (0, common_1.Patch)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER),
    (0, swagger_1.ApiOperation)({
        summary: `Update global payment-method fee config (${branding_1.APP_BRAND})`,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [update_payment_method_fees_dto_1.UpdatePaymentMethodFeesDto]),
    __metadata("design:returntype", Promise)
], PaymentMethodFeesController.prototype, "patch", null);
exports.PaymentMethodFeesController = PaymentMethodFeesController = __decorate([
    (0, swagger_1.ApiTags)('payment-method-fees'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('payment-method-fees'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [payment_method_fees_service_1.PaymentMethodFeesService,
        prisma_service_1.PrismaService])
], PaymentMethodFeesController);
//# sourceMappingURL=payment-method-fees.controller.js.map