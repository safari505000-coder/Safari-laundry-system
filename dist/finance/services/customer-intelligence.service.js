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
exports.CustomerIntelligenceService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const customer_evaluator_1 = require("../../customers/customer-evaluator");
const prisma_service_1 = require("../../prisma/prisma.service");
let CustomerIntelligenceService = class CustomerIntelligenceService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async buildCustomerIntelligence(customerId, financials) {
        const [lifetime, paidOrders] = await Promise.all([
            this.prisma.order.aggregate({
                where: {
                    customerId,
                    status: { not: client_1.OrderStatus.CANCELED },
                },
                _sum: { totalPrice: true },
            }),
            this.prisma.order.findMany({
                where: {
                    customerId,
                    status: { not: client_1.OrderStatus.CANCELED },
                    cashStatus: {
                        in: [
                            client_1.CashStatus.PAID_TO_DRIVER,
                            client_1.CashStatus.PAID_ONLINE,
                            client_1.CashStatus.HANDED_OVER_TO_OFFICE,
                        ],
                    },
                    completedAt: { not: null },
                },
                select: { createdAt: true, completedAt: true },
                take: 200,
                orderBy: { completedAt: 'desc' },
            }),
        ]);
        const invoices = money(financials.consumedKd);
        const due = money(financials.totalDueKd);
        const paymentConsistency = invoices <= 0 ? 1 : (invoices - due) / invoices;
        const avgPaymentDelayHours = paidOrders.length === 0 ?
            0
            : paidOrders.reduce((sum, order) => {
                const completedAt = order.completedAt ?? order.createdAt;
                return sum + Math.max(completedAt.getTime() - order.createdAt.getTime(), 0) / 3600000;
            }, 0) / paidOrders.length;
        return (0, customer_evaluator_1.evaluateCustomerIntelligence)({
            ...financials,
            paymentConsistency,
            avgPaymentDelayHours,
            lifetimeValueKd: toKd(lifetime._sum.totalPrice),
        });
    }
};
exports.CustomerIntelligenceService = CustomerIntelligenceService;
exports.CustomerIntelligenceService = CustomerIntelligenceService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CustomerIntelligenceService);
function money(value) {
    const n = typeof value === 'number' ? value : Number.parseFloat(value ?? '0');
    return Number.isFinite(n) ? n : 0;
}
function toKd(value) {
    return value?.toFixed(4) ?? '0.0000';
}
//# sourceMappingURL=customer-intelligence.service.js.map