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
exports.Customer360Service = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const customer_blocking_service_1 = require("../common/services/customer-blocking.service");
const customer_360_financials_1 = require("./customer-360-financials");
const customer_evaluator_1 = require("./customer-evaluator");
const sanitize_customer_360_view_1 = require("./sanitize-customer-360-view");
const INTERNAL_CUSTOMER_360_ROLES = new Set([
    client_1.SafariRole.CALL_CENTER,
    client_1.SafariRole.CALL_CENTER_SUPERVISOR,
]);
let Customer360Service = class Customer360Service {
    prisma;
    customerBlocking;
    constructor(prisma, customerBlocking) {
        this.prisma = prisma;
        this.customerBlocking = customerBlocking;
    }
    async get360(customerId, user) {
        const role = (user.role ?? '').trim().toUpperCase();
        this.assertAuthorizedForCustomer(customerId, role, user.linkedCustomerId ?? null);
        const customerRow = await this.prisma.customer.findUnique({
            where: { id: customerId },
            select: {
                id: true,
                displayName: true,
                phone: true,
                phone2: true,
            },
        });
        if (!customerRow) {
            throw new common_1.NotFoundException('Customer not found');
        }
        const financials = await (0, customer_360_financials_1.computeCustomer360FinancialCore)(this.prisma, customerId);
        const blocked = await this.customerBlocking.applyAutoBlockFromFinancials(customerId, financials.totalDueKd);
        if (blocked) {
            financials.isBlocked = blocked.isBlocked;
            financials.blockReason = blocked.blockReason;
            financials.blockedAtIso = blocked.blockedAt?.toISOString() ?? null;
        }
        const rating = (0, customer_evaluator_1.evaluateCustomer)(financials);
        const insight = (0, customer_evaluator_1.buildInsight)(financials, rating);
        const subs = await this.prisma.customerSubscription.findMany({
            where: { customerId },
            orderBy: { createdAt: 'desc' },
            take: 48,
            select: {
                id: true,
                status: true,
                planNameSnapshot: true,
                planSalePriceSnapshot: true,
                planActualBalanceSnapshot: true,
                planValidityDaysSnapshot: true,
                carriedBalanceKd: true,
                activatedAt: true,
                expiresAt: true,
                closedAt: true,
                closedReason: true,
            },
        });
        const subscriptions = subs.map((s) => ({
            id: s.id,
            status: s.status,
            planNameSnapshot: s.planNameSnapshot,
            planSalePriceKd: s.planSalePriceSnapshot.toFixed(4),
            planActualBalanceKd: s.planActualBalanceSnapshot.toFixed(4),
            planValidityDays: s.planValidityDaysSnapshot,
            carriedBalanceKd: s.carriedBalanceKd.toFixed(4),
            activatedAtIso: s.activatedAt.toISOString(),
            expiresAtIso: s.expiresAt.toISOString(),
            closedAtIso: s.closedAt?.toISOString() ?? null,
            closedReason: s.closedReason,
        }));
        const fbAgg = await this.prisma.orderFeedback.aggregate({
            where: { order: { customerId } },
            _avg: { rating: true },
        });
        const feedbackAverage = fbAgg._avg.rating != null ? Math.round(Number(fbAgg._avg.rating) * 100) / 100 : null;
        const statement = {
            financials,
            narrativeLines: [
                `قراءة داخلية: المبلغ المطلوب دفعه ${financials.totalDueKd} د.ك مقارنة بالمدفوعات.`,
                'راقب تجاوز الاشتراك مقارنة بقيمة الباقة الفعلية لهذا العميل.',
            ],
        };
        const subscription = {
            subscriptionValueKd: financials.subscriptionValueKd,
            subscriptionConsumedKd: financials.subscriptionConsumedKd,
            subscriptionRemainingKd: financials.subscriptionRemainingKd,
        };
        const score = {
            value: Math.max(0, Math.min(100, 85 - Number.parseFloat(financials.totalDueKd) * 2 + (feedbackAverage ?? 0) * 2)),
            feedbackAverage,
            factors: ['مستوى الدين من السجل', 'سرعة إصدار الفواتير', 'تقييمات العميل'],
        };
        const insights = {
            summary: 'قراءة تشغيلية للمبلغ المستحق وتجاوز الاشتراك.',
            detail: 'هذا الملف يوضح المبالغ غير المسددة وتجاوز الاشتراك عندما تتخطى الطلبات قيمة الباقة.',
        };
        const internal = {
            customer: {
                id: customerRow.id,
                displayName: customerRow.displayName,
                phone: customerRow.phone,
                phone2: customerRow.phone2,
            },
            subscriptions,
            subscription,
            statement,
            rating,
            insight,
            score,
            insights,
            alerts: [
                {
                    code: 'DEBT_WATCH',
                    message: 'مبلغ مستحق مرتفع — اتبع إجراءات التحصيل.',
                },
            ],
            internalNotes: 'ملاحظة داخلية: تمت متابعة العميل بخصوص المبلغ المستحق؛ راقب الاستهلاك في الدورة القادمة.',
        };
        if (INTERNAL_CUSTOMER_360_ROLES.has(role)) {
            return internal;
        }
        if (role === client_1.SafariRole.CUSTOMER) {
            return (0, sanitize_customer_360_view_1.sanitizeCustomerView)(internal);
        }
        throw new common_1.ForbiddenException('Customer 360 is not available for this role.');
    }
    assertAuthorizedForCustomer(customerId, role, linkedCustomerId) {
        if (INTERNAL_CUSTOMER_360_ROLES.has(role)) {
            return;
        }
        if (role === client_1.SafariRole.CUSTOMER) {
            if (!linkedCustomerId || linkedCustomerId !== customerId) {
                throw new common_1.ForbiddenException('Cannot access another customer profile.');
            }
            return;
        }
        throw new common_1.ForbiddenException('Customer 360 is not available for this role.');
    }
};
exports.Customer360Service = Customer360Service;
exports.Customer360Service = Customer360Service = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        customer_blocking_service_1.CustomerBlockingService])
], Customer360Service);
//# sourceMappingURL=customer-360.service.js.map