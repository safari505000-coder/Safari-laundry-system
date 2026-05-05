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
exports.CustomerBlockingService = void 0;
const common_1 = require("@nestjs/common");
const audit_logs_service_1 = require("../../audit-logs/audit-logs.service");
const prisma_service_1 = require("../../prisma/prisma.service");
const customer_360_financials_1 = require("../../customers/customer-360-financials");
const HIGH_DEBT_BLOCK_THRESHOLD = 500;
let CustomerBlockingService = class CustomerBlockingService {
    prisma;
    auditLogs;
    constructor(prisma, auditLogs) {
        this.prisma = prisma;
        this.auditLogs = auditLogs;
    }
    async findCustomerForRequest(req) {
        const params = req.params;
        const body = (req.body ?? {});
        const customerId = firstString(params.customerId, params.id, body.customerId);
        if (customerId) {
            return this.prisma.customer.findUnique({
                where: { id: customerId },
                select: {
                    id: true,
                    isBlocked: true,
                    blockReason: true,
                    blockedAt: true,
                },
            });
        }
        const phone = normalizePhone(firstString(body.customerPhone, body.phone));
        if (!phone) {
            return null;
        }
        return this.prisma.customer.findFirst({
            where: { OR: [{ phone }, { phone2: phone }] },
            select: {
                id: true,
                isBlocked: true,
                blockReason: true,
                blockedAt: true,
            },
        });
    }
    canOverrideBlockedCustomer(role) {
        const r = (role ?? '').trim().toUpperCase();
        return r === 'MANAGER' || r === 'BRANCH_MANAGER';
    }
    hasOverrideHeader(req) {
        const raw = req.headers['x-override-block'];
        const value = Array.isArray(raw) ? raw[0] : raw;
        return typeof value === 'string' && value.trim().toLowerCase() === 'true';
    }
    async logBlockedOverride(req, customer) {
        const user = req.user;
        this.auditLogs.logFinancialEvent({
            action: 'OVERRIDE_BLOCKED_CUSTOMER',
            customerId: customer.id,
            userId: user?.userId ?? user?.sub ?? null,
            role: user?.role ?? null,
            source: 'CUSTOMER_BLOCK_GUARD',
            changes: {
                blockReason: customer.blockReason,
                overrideHeader: true,
                endpoint: req.originalUrl ?? req.url,
                method: req.method,
            },
        });
    }
    async autoBlockIfNeeded(customerId) {
        const [customer, totalDueKd] = await Promise.all([
            this.prisma.customer.findUnique({
                where: { id: customerId },
                select: {
                    id: true,
                    isBlocked: true,
                    blockReason: true,
                    blockedAt: true,
                },
            }),
            this.computeTotalDueKd(customerId),
        ]);
        if (!customer)
            return null;
        if (totalDueKd <= HIGH_DEBT_BLOCK_THRESHOLD || customer.isBlocked) {
            return customer;
        }
        const blocked = await this.prisma.customer.update({
            where: { id: customerId },
            data: {
                isBlocked: true,
                blockReason: 'دين مرتفع',
                blockedAt: new Date(),
            },
            select: {
                id: true,
                isBlocked: true,
                blockReason: true,
                blockedAt: true,
            },
        });
        this.auditLogs.logFinancialEvent({
            action: 'CUSTOMER_BLOCKED',
            customerId,
            source: 'AUTO_HIGH_DEBT',
            changes: {
                totalDueKd,
                blockReason: blocked.blockReason,
                blockedAt: blocked.blockedAt?.toISOString() ?? null,
            },
        });
        return blocked;
    }
    async applyAutoBlockFromFinancials(customerId, totalDueKd) {
        const due = Number.parseFloat(totalDueKd);
        if (!Number.isFinite(due) || due <= HIGH_DEBT_BLOCK_THRESHOLD) {
            return this.prisma.customer.findUnique({
                where: { id: customerId },
                select: {
                    id: true,
                    isBlocked: true,
                    blockReason: true,
                    blockedAt: true,
                },
            });
        }
        return this.autoBlockIfNeeded(customerId);
    }
    async manualBlock(input) {
        const customer = await this.prisma.customer.findUnique({
            where: { id: input.customerId },
            select: {
                id: true,
                isBlocked: true,
                blockReason: true,
                blockedAt: true,
            },
        });
        if (!customer) {
            throw new Error(`Customer ${input.customerId} not found`);
        }
        if (customer.isBlocked) {
            return customer;
        }
        const blocked = await this.prisma.customer.update({
            where: { id: input.customerId },
            data: {
                isBlocked: true,
                blockReason: input.reason.trim() || 'حظر يدوي',
                blockedAt: new Date(),
            },
            select: {
                id: true,
                isBlocked: true,
                blockReason: true,
                blockedAt: true,
            },
        });
        this.auditLogs.logFinancialEvent({
            action: 'CUSTOMER_BLOCKED',
            customerId: input.customerId,
            userId: input.actorUserId,
            role: input.actorRole,
            source: 'CALL_CENTER_MANUAL',
            changes: {
                reason: blocked.blockReason,
                blockedAt: blocked.blockedAt?.toISOString() ?? null,
            },
        });
        return blocked;
    }
    async manualUnblock(input) {
        const before = await this.prisma.customer.findUnique({
            where: { id: input.customerId },
            select: {
                id: true,
                isBlocked: true,
                blockReason: true,
                blockedAt: true,
            },
        });
        if (!before) {
            throw new Error(`Customer ${input.customerId} not found`);
        }
        const after = await this.prisma.customer.update({
            where: { id: input.customerId },
            data: {
                isBlocked: false,
                blockReason: null,
                blockedAt: null,
            },
            select: {
                id: true,
                isBlocked: true,
                blockReason: true,
                blockedAt: true,
            },
        });
        this.auditLogs.logFinancialEvent({
            action: 'CUSTOMER_UNBLOCKED',
            customerId: input.customerId,
            userId: input.actorUserId,
            role: input.actorRole,
            source: 'CALL_CENTER_MANUAL',
            changes: {
                previousReason: before.blockReason,
                previousBlockedAt: before.blockedAt?.toISOString() ?? null,
                unblockReason: input.reason,
                wasBlocked: before.isBlocked,
            },
        });
        return after;
    }
    async computeTotalDueKd(customerId) {
        const fin = await (0, customer_360_financials_1.computeCustomer360FinancialCore)(this.prisma, customerId);
        const due = Number.parseFloat(fin.totalDueKd);
        return Number.isFinite(due) ? due : 0;
    }
};
exports.CustomerBlockingService = CustomerBlockingService;
exports.CustomerBlockingService = CustomerBlockingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_logs_service_1.AuditLogsService])
], CustomerBlockingService);
function firstString(...values) {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return null;
}
function normalizePhone(value) {
    const phone = value?.replace(/[\s-]/g, '').trim() ?? '';
    return phone || null;
}
//# sourceMappingURL=customer-blocking.service.js.map