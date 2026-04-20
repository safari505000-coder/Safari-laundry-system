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
function daysElapsedSince(from) {
    return Math.max(0, Math.round((utcDayNumber(new Date()) - utcDayNumber(from)) / 86400000));
}
const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function looksLikeUuid(v) {
    return typeof v === 'string' && UUID_RE.test(v.trim());
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
    async list(q) {
        const needle = q?.trim() ?? '';
        const hasNeedle = needle.length > 0;
        const digits = hasNeedle ? needle.replace(/\D+/g, '') : '';
        const subscriptionWhere = {
            OR: [
                {
                    transactionHistory: {
                        some: { type: client_1.LedgerTransactionType.SUBSCRIPTION_ACTIVATION },
                    },
                },
                { wallet: { subscriptionActivatedAt: { not: null } } },
                { wallet: { subscriptionExpiresAt: { not: null } } },
            ],
        };
        const where = hasNeedle ?
            {
                AND: [
                    subscriptionWhere,
                    {
                        OR: [
                            { displayName: { contains: needle, mode: 'insensitive' } },
                            { phone: { contains: needle, mode: 'insensitive' } },
                            ...(digits.length > 0
                                ? [{ phone: { contains: digits } }]
                                : []),
                        ],
                    },
                ],
            }
            : subscriptionWhere;
        const customers = await this.prisma.customer.findMany({
            where,
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
        const now = Date.now();
        const planIds = new Set();
        for (const c of customers) {
            const meta = c.transactionHistory[0]?.metadata;
            if (meta?.planId) {
                planIds.add(meta.planId);
            }
            if (c.wallet?.subscriptionPlanId) {
                planIds.add(c.wallet.subscriptionPlanId);
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
            const debtStr = w?.debt.toString() ?? '0.0000';
            let startDate = w?.subscriptionActivatedAt ?? null;
            let expiryDate = w?.subscriptionExpiresAt ?? null;
            const rawWalletName = w?.subscriptionPlanName ?? null;
            const rawMetaName = c.transactionHistory[0]?.metadata
                ?.planName ?? null;
            let subscriptionType = (rawWalletName && !looksLikeUuid(rawWalletName) && rawWalletName) ||
                (rawMetaName && !looksLikeUuid(rawMetaName) && rawMetaName) ||
                null;
            const lastAct = c.transactionHistory[0];
            if ((!expiryDate || !startDate || !subscriptionType) && lastAct) {
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
                    const metaName = meta?.planName && !looksLikeUuid(meta.planName)
                        ? meta.planName
                        : null;
                    subscriptionType = metaName ?? plan?.name ?? null;
                }
            }
            if (!subscriptionType && w?.subscriptionPlanId) {
                const plan = planMap.get(w.subscriptionPlanId);
                if (plan?.name)
                    subscriptionType = plan.name;
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
            const activationDate = startDate ?? c.transactionHistory[0]?.createdAt ?? null;
            const invoiceAgeDays = activationDate ? daysElapsedSince(activationDate) : null;
            let planId = w?.subscriptionPlanId ?? null;
            if (!planId) {
                const metaPlanId = c.transactionHistory[0]?.metadata
                    ?.planId;
                if (typeof metaPlanId === 'string' && metaPlanId.length > 0) {
                    planId = metaPlanId;
                }
            }
            const lastReminderAt = w?.subscriptionLastReminderAt ?? null;
            const reminderCount = w?.subscriptionReminderCount ?? 0;
            const canRemindNow = !lastReminderAt || now - lastReminderAt.getTime() >= REMINDER_COOLDOWN_MS;
            rows.push({
                customerId: c.id,
                customerName,
                customerPhone: c.phone ?? null,
                subscriptionType: subscriptionType ?? '—',
                planId,
                startDate: startDate?.toISOString() ?? null,
                expiryDate: expiryDate?.toISOString() ?? null,
                remainingDays,
                balance: balanceStr,
                debt: debtStr,
                rowStatus,
                invoiceAgeDays,
                reminderCount,
                lastReminderAtIso: lastReminderAt?.toISOString() ?? null,
                canRemindNow,
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