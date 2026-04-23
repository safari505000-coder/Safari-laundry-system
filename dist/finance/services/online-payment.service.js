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
Object.defineProperty(exports, "__esModule", { value: true });
exports.OnlinePaymentService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const payments_service_1 = require("../../common/services/payments.service");
const prisma_service_1 = require("../../prisma/prisma.service");
let OnlinePaymentService = class OnlinePaymentService {
    prisma;
    payments;
    constructor(prisma, payments) {
        this.prisma = prisma;
        this.payments = payments;
    }
    isPublicMockCheckoutAvailable() {
        return this.payments.isPublicMockCheckoutAvailable();
    }
    allowDevMockCallback(body) {
        return this.payments.allowDevMockCallback(body);
    }
    verifyIntegratedCallback(dto) {
        return this.payments.verifyIntegratedCallback(dto);
    }
    normalizeCallbackStatus(status) {
        return this.payments.normalizeCallbackStatus(status);
    }
    async finalizePaidOrderFromGateway(referenceId) {
        await this.payments.finalizePaidOrderFromGateway(referenceId);
    }
    async ensurePaymentLinkForUnpaidOrder(orderId) {
        const link = await this.payments.ensurePaymentLinkForUnpaidOrder(orderId);
        return { url: link.url };
    }
    async getTotalOnlineRevenue() {
        const sum = await this.prisma.order.aggregate({
            where: {
                status: client_1.OrderStatus.COMPLETED,
                posPaymentMethod: {
                    in: [client_1.PosPaymentMethod.ONLINE, client_1.PosPaymentMethod.PAYMENT_LINK],
                },
            },
            _sum: { totalPrice: true },
        });
        return sum._sum.totalPrice?.toString() ?? '0.0000';
    }
};
exports.OnlinePaymentService = OnlinePaymentService;
exports.OnlinePaymentService = OnlinePaymentService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        payments_service_1.PaymentsService])
], OnlinePaymentService);
//# sourceMappingURL=online-payment.service.js.map