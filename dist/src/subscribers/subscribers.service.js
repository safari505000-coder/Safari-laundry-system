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
exports.SubscribersService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
function utcDayNumber(d) {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
function calendarDaysRemaining(expiry) {
    return Math.round((utcDayNumber(expiry) - utcDayNumber(new Date())) / 86400000);
}
function addUtcDays(from, days) {
    const out = new Date(from.getTime());
    out.setUTCDate(out.getUTCDate() + days);
    return out;
}
let SubscribersService = class SubscribersService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async list() {
        const customers = await this.prisma.customer.findMany({
            where: {
                OR: [
                    {
                        transactionHistory: {
                            some: { type: client_1.LedgerTransactionType.SUBSCRIPTION_ACTIVATION },
                        },
                    },
                    { wallet: { subscriptionActivatedAt: { not: null } } },
                    { wallet: { subscriptionExpiresAt: { not: null } } },
                ],
            },
            select: {
                id: true,
                phone: true,
                displayName: true,
                wallet: true,
                transactionHistory: {
                    where: { type: client_1.LedgerTransactionType.SUBSCRIPTION_ACTIVATION },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { createdAt: true, metadata: true },
                },
            },
        });
        const planIds = new Set();
        for (const c of customers) {
            const meta = c.transactionHistory[0]?.metadata;
            if (meta?.planId) {
                planIds.add(meta.planId);
            }
        }
        const plans = planIds.size > 0 ?
            await this.prisma.subscriptionPlan.findMany({
                where: { id: { in: [...planIds] } },
                select: { id: true, validityDays: true, name: true },
            })
            : [];
        const planMap = new Map(plans.map((p) => [p.id, p]));
        const rows = [];
        for (const c of customers) {
            const w = c.wallet;
            const balanceStr = w?.balance.toString() ?? '0.0000';
            const balanceNum = Number.parseFloat(balanceStr);
            let startDate = w?.subscriptionActivatedAt ?? null;
            let expiryDate = w?.subscriptionExpiresAt ?? null;
            let subscriptionType = w?.subscriptionPlanName ??
                (c.transactionHistory[0]?.metadata
                    ?.planName ??
                    null);
            const lastAct = c.transactionHistory[0];
            if ((!expiryDate || !startDate) && lastAct) {
                const meta = lastAct.metadata;
                const plan = meta?.planId ? planMap.get(meta.planId) : undefined;
                const vd = plan && plan.validityDays > 0 ? plan.validityDays : 30;
                if (!startDate) {
                    startDate = lastAct.createdAt;
                }
                if (!expiryDate && startDate) {
                    expiryDate = addUtcDays(startDate, vd);
                }
                if (!subscriptionType) {
                    subscriptionType = meta?.planName ?? plan?.name ?? null;
                }
            }
            const customerName = [c.displayName, c.phone].find((s) => typeof s === 'string' && s.trim().length > 0) ?? c.id;
            const remainingDays = expiryDate ? calendarDaysRemaining(expiryDate) : null;
            let rowStatus;
            if (remainingDays !== null) {
                if (remainingDays < 0) {
                    rowStatus = 'expired';
                }
                else if (remainingDays < 5) {
                    rowStatus = 'active_warn';
                }
                else {
                    rowStatus = 'active_ok';
                }
            }
            else if (Number.isFinite(balanceNum) && balanceNum > 0) {
                rowStatus = 'open_credit';
            }
            else {
                rowStatus = 'expired';
            }
            rows.push({
                customerId: c.id,
                customerName,
                subscriptionType: subscriptionType ?? '—',
                startDate: startDate?.toISOString() ?? null,
                expiryDate: expiryDate?.toISOString() ?? null,
                remainingDays,
                balance: balanceStr,
                rowStatus,
            });
        }
        rows.sort((a, b) => {
            const ar = a.remainingDays;
            const br = b.remainingDays;
            if (ar === null && br === null) {
                return a.customerName.localeCompare(b.customerName);
            }
            if (ar === null) {
                return 1;
            }
            if (br === null) {
                return -1;
            }
            if (ar !== br) {
                return ar - br;
            }
            return a.customerName.localeCompare(b.customerName);
        });
        return rows;
    }
};
exports.SubscribersService = SubscribersService;
exports.SubscribersService = SubscribersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SubscribersService);
//# sourceMappingURL=subscribers.service.js.map