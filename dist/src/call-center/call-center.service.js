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
exports.CallCenterService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const customer_ledger_service_1 = require("../customer-ledger/customer-ledger.service");
const payments_service_1 = require("../common/services/payments.service");
const ORDER_REMINDER_COOLDOWN_MS = 2.5 * 60 * 60 * 1000;
const SUBSCRIBER_REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;
function buildReminderResult(args) {
    const { sent, reminderCount, lastReminderAt, now, cooldownMs } = args;
    const nextAllowedAt = !sent && lastReminderAt
        ? new Date(lastReminderAt.getTime() + cooldownMs)
        : null;
    const remainingMs = nextAllowedAt
        ? Math.max(0, nextAllowedAt.getTime() - now.getTime())
        : null;
    const minutesUntilNext = remainingMs !== null ? Math.ceil(remainingMs / (60 * 1000)) : null;
    const hoursUntilNext = remainingMs !== null ? Math.ceil(remainingMs / (60 * 60 * 1000)) : null;
    return {
        sent,
        reminderCount,
        lastReminderAtIso: lastReminderAt?.toISOString() ?? null,
        nextAllowedAtIso: nextAllowedAt?.toISOString() ?? null,
        hoursUntilNext,
        minutesUntilNext,
    };
}
const FOUR_DP = (d) => d.toFixed(4);
const KWD_DP = (d) => d.toFixed(3);
const toIsoDay = (d) => d.toISOString().slice(0, 10);
function parseDayUtc(iso) {
    const d = new Date(`${iso}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) {
        throw new common_1.BadRequestException(`Invalid date: ${iso}`);
    }
    return d;
}
const KUWAIT_OFFSET_MS = 3 * 60 * 60 * 1000;
function kuwaitDayBounds(now) {
    const shifted = new Date(now.getTime() + KUWAIT_OFFSET_MS);
    const y = shifted.getUTCFullYear();
    const m = shifted.getUTCMonth();
    const d = shifted.getUTCDate();
    const dayStart = new Date(Date.UTC(y, m, d) - KUWAIT_OFFSET_MS);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const dayIsoLocal = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return { dayStart, dayEnd, dayIsoLocal };
}
function orderBranchWhere(branchId) {
    if (!branchId)
        return undefined;
    return {
        OR: [
            { driver: { is: { branchId } } },
            {
                driverId: null,
                customer: { is: { originBranchId: branchId } },
            },
        ],
    };
}
function ledgerBranchWhere(branchId) {
    if (!branchId)
        return undefined;
    return {
        OR: [
            { performedBy: { is: { branchId } } },
            { order: { is: { driver: { is: { branchId } } } } },
            { order: { is: { customer: { is: { originBranchId: branchId } } } } },
            { customer: { is: { originBranchId: branchId } } },
        ],
    };
}
function extractDebtSettled(meta) {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
        return new client_1.Prisma.Decimal(0);
    }
    const v = meta.debtSettled;
    if (typeof v !== 'string')
        return new client_1.Prisma.Decimal(0);
    try {
        return new client_1.Prisma.Decimal(v);
    }
    catch {
        return new client_1.Prisma.Decimal(0);
    }
}
function isDebtViaLinkRow(meta) {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta))
        return false;
    return meta.debtSettlementViaLink === true;
}
let CallCenterService = class CallCenterService {
    prisma;
    customerLedger;
    payments;
    constructor(prisma, customerLedger, payments) {
        this.prisma = prisma;
        this.customerLedger = customerLedger;
        this.payments = payments;
    }
    async ensureOrderPaymentLink(orderId) {
        const link = await this.payments.ensurePaymentLinkForUnpaidOrder(orderId);
        return { url: link.url };
    }
    async markCollectionOrderPaid(orderId, method, performedByUserId) {
        return this.payments.manuallyMarkOrderPaidByMethod({
            orderId,
            method,
            performedByUserId,
        });
    }
    listActiveSubscriptionPlans() {
        return this.prisma.subscriptionPlan.findMany({
            where: { isActive: true },
            orderBy: { name: 'asc' },
            select: {
                id: true,
                name: true,
                salePrice: true,
                actualBalance: true,
            },
        });
    }
    async searchCustomers(query) {
        const q = query.trim();
        if (q.length < 2) {
            throw new common_1.BadRequestException('Search query must be at least 2 characters');
        }
        return this.prisma.customer.findMany({
            where: {
                OR: [
                    { phone: { contains: q, mode: 'insensitive' } },
                    { phone2: { contains: q, mode: 'insensitive' } },
                    { address: { contains: q, mode: 'insensitive' } },
                    { displayName: { contains: q, mode: 'insensitive' } },
                ],
            },
            take: 50,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                phone: true,
                phone2: true,
                displayName: true,
                address: true,
                createdAt: true,
                wallet: {
                    select: {
                        balance: true,
                        debt: true,
                    },
                },
            },
        });
    }
    async activateSubscription(userId, dto) {
        return this.prisma.$transaction(async (tx) => {
            const settlement = await this.customerLedger.activateSubscriptionPlan(tx, {
                customerId: dto.customerId,
                planId: dto.planId,
                performedByUserId: userId,
            });
            const [customer, plan, wallet] = await Promise.all([
                tx.customer.findUniqueOrThrow({
                    where: { id: dto.customerId },
                    select: {
                        id: true,
                        phone: true,
                        phone2: true,
                        address: true,
                        displayName: true,
                    },
                }),
                tx.subscriptionPlan.findUniqueOrThrow({
                    where: { id: dto.planId },
                }),
                tx.customerWallet.findUniqueOrThrow({
                    where: { customerId: dto.customerId },
                }),
            ]);
            return {
                customer,
                plan: {
                    id: plan.id,
                    name: plan.name,
                    price: plan.salePrice.toString(),
                    creditAmount: plan.actualBalance.toString(),
                },
                wallet: {
                    balance: wallet.balance.toString(),
                    debt: wallet.debt.toString(),
                },
                settlement,
            };
        });
    }
    async extendSubscription(userId, dto) {
        return this.prisma.$transaction(async (tx) => {
            const wallet = await tx.customerWallet.findUnique({
                where: { customerId: dto.customerId },
                select: {
                    id: true,
                    balance: true,
                    debt: true,
                    subscriptionPlanId: true,
                    subscriptionPlanName: true,
                    subscriptionActivatedAt: true,
                    subscriptionExpiresAt: true,
                },
            });
            if (!wallet) {
                throw new common_1.NotFoundException('Customer has no wallet — activate a subscription before extending.');
            }
            if (!wallet.subscriptionPlanId || !wallet.subscriptionExpiresAt) {
                throw new common_1.BadRequestException('No active subscription found — use Upgrade to start a new plan.');
            }
            const now = new Date();
            const anchor = wallet.subscriptionExpiresAt.getTime() > now.getTime()
                ? wallet.subscriptionExpiresAt
                : now;
            const newExpiry = new Date(anchor.getTime());
            newExpiry.setUTCDate(newExpiry.getUTCDate() + dto.extensionDays);
            await tx.customerWallet.update({
                where: { id: wallet.id },
                data: { subscriptionExpiresAt: newExpiry },
            });
            await tx.transactionHistory.create({
                data: {
                    type: client_1.LedgerTransactionType.SUBSCRIPTION_ACTIVATION,
                    customerId: dto.customerId,
                    amount: new client_1.Prisma.Decimal(0),
                    balanceBefore: wallet.balance,
                    balanceAfter: wallet.balance,
                    debtBefore: wallet.debt,
                    debtAfter: wallet.debt,
                    performedById: userId,
                    metadata: {
                        extensionOnly: true,
                        extensionDays: dto.extensionDays,
                        planId: wallet.subscriptionPlanId,
                        planName: wallet.subscriptionPlanName ?? null,
                        previousExpiresAt: wallet.subscriptionExpiresAt.toISOString(),
                        newExpiresAt: newExpiry.toISOString(),
                    },
                },
            });
            return {
                customerId: dto.customerId,
                extensionDays: dto.extensionDays,
                previousExpiresAt: wallet.subscriptionExpiresAt.toISOString(),
                newExpiresAt: newExpiry.toISOString(),
                planId: wallet.subscriptionPlanId,
                planName: wallet.subscriptionPlanName ?? null,
            };
        });
    }
    async listCustomerSettlementHistory(customerId, take = 40) {
        const customer = await this.prisma.customer.findUnique({
            where: { id: customerId },
            select: { id: true },
        });
        if (!customer) {
            throw new common_1.NotFoundException('Customer not found');
        }
        const rows = await this.prisma.transactionHistory.findMany({
            where: {
                customerId,
                type: {
                    in: [
                        client_1.LedgerTransactionType.SUBSCRIPTION_ACTIVATION,
                        client_1.LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
                    ],
                },
            },
            orderBy: { createdAt: 'desc' },
            take,
            select: {
                id: true,
                createdAt: true,
                type: true,
                balanceAfter: true,
                debtAfter: true,
                orderId: true,
                metadata: true,
            },
        });
        return rows.map((r) => {
            const meta = r.metadata && typeof r.metadata === 'object' && !Array.isArray(r.metadata)
                ? r.metadata
                : {};
            const str = (k) => {
                const v = meta[k];
                return typeof v === 'string' ? v : undefined;
            };
            return {
                id: r.id,
                createdAt: r.createdAt,
                type: r.type,
                totalCollected: str('totalCollected'),
                debtSettled: str('debtSettled'),
                creditedToBalance: str('creditedToBalance'),
                balanceAfter: r.balanceAfter.toString(),
                debtAfter: r.debtAfter.toString(),
                planName: str('planName'),
                orderId: r.orderId ?? undefined,
            };
        });
    }
    async sendOrderReminder(orderId) {
        const now = new Date();
        const cutoff = new Date(now.getTime() - ORDER_REMINDER_COOLDOWN_MS);
        const update = await this.prisma.order.updateMany({
            where: {
                id: orderId,
                OR: [
                    { lastReminderAt: null },
                    { lastReminderAt: { lt: cutoff } },
                ],
            },
            data: {
                reminderCount: { increment: 1 },
                lastReminderAt: now,
            },
        });
        const fresh = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: { reminderCount: true, lastReminderAt: true },
        });
        if (!fresh)
            throw new common_1.NotFoundException('Order not found');
        return buildReminderResult({
            sent: update.count > 0,
            reminderCount: fresh.reminderCount,
            lastReminderAt: fresh.lastReminderAt,
            now,
            cooldownMs: ORDER_REMINDER_COOLDOWN_MS,
        });
    }
    async sendSubscriberReminder(customerId) {
        const now = new Date();
        const cutoff = new Date(now.getTime() - SUBSCRIBER_REMINDER_COOLDOWN_MS);
        const update = await this.prisma.customerWallet.updateMany({
            where: {
                customerId,
                OR: [
                    { subscriptionLastReminderAt: null },
                    { subscriptionLastReminderAt: { lt: cutoff } },
                ],
            },
            data: {
                subscriptionReminderCount: { increment: 1 },
                subscriptionLastReminderAt: now,
            },
        });
        const fresh = await this.prisma.customerWallet.findUnique({
            where: { customerId },
            select: {
                subscriptionReminderCount: true,
                subscriptionLastReminderAt: true,
            },
        });
        if (!fresh) {
            const customer = await this.prisma.customer.findUnique({
                where: { id: customerId },
                select: { id: true },
            });
            if (!customer)
                throw new common_1.NotFoundException('Customer not found');
            const createdWallet = await this.prisma.customerWallet.create({
                data: {
                    customerId,
                    subscriptionReminderCount: 1,
                    subscriptionLastReminderAt: now,
                },
                select: {
                    subscriptionReminderCount: true,
                    subscriptionLastReminderAt: true,
                },
            });
            return buildReminderResult({
                sent: true,
                reminderCount: createdWallet.subscriptionReminderCount,
                lastReminderAt: createdWallet.subscriptionLastReminderAt,
                now,
                cooldownMs: SUBSCRIBER_REMINDER_COOLDOWN_MS,
            });
        }
        return buildReminderResult({
            sent: update.count > 0,
            reminderCount: fresh.subscriptionReminderCount,
            lastReminderAt: fresh.subscriptionLastReminderAt,
            now,
            cooldownMs: SUBSCRIBER_REMINDER_COOLDOWN_MS,
        });
    }
    async getOperationsSummary(branchId = null) {
        const now = new Date();
        const { dayStart, dayEnd, dayIsoLocal } = kuwaitDayBounds(now);
        const orderBranch = orderBranchWhere(branchId);
        const ledgerBranch = ledgerBranchWhere(branchId);
        const [unpaidAgg, todaysLedgerRows, pendingLinksCount] = await Promise.all([
            this.prisma.order.aggregate({
                _sum: { totalPrice: true },
                where: {
                    cashStatus: client_1.CashStatus.UNPAID,
                    status: { not: client_1.OrderStatus.CANCELED },
                    ...(orderBranch ?? {}),
                },
            }),
            this.prisma.transactionHistory.findMany({
                where: {
                    createdAt: { gte: dayStart, lt: dayEnd },
                    type: {
                        in: [
                            client_1.LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
                            client_1.LedgerTransactionType.SUBSCRIPTION_ACTIVATION,
                        ],
                    },
                    ...(ledgerBranch ?? {}),
                },
                select: {
                    id: true,
                    type: true,
                    metadata: true,
                    createdAt: true,
                    orderId: true,
                },
            }),
            this.prisma.order.count({
                where: {
                    cashStatus: client_1.CashStatus.UNPAID,
                    status: { not: client_1.OrderStatus.CANCELED },
                    posHostedPaymentUrl: { not: null },
                    ...(orderBranch ?? {}),
                },
            }),
        ]);
        const debtViaLinkRows = todaysLedgerRows.filter((r) => isDebtViaLinkRow(r.metadata));
        const collectedTodayViaLink = debtViaLinkRows.reduce((acc, r) => acc.plus(extractDebtSettled(r.metadata)), new client_1.Prisma.Decimal(0));
        const recoveredToday = todaysLedgerRows.reduce((acc, r) => acc.plus(extractDebtSettled(r.metadata)), new client_1.Prisma.Decimal(0));
        return {
            totalMarketDebtKd: KWD_DP(unpaidAgg._sum.totalPrice ?? new client_1.Prisma.Decimal(0)),
            debtCollectedTodayKd: KWD_DP(collectedTodayViaLink),
            debtRecoveredTodayKd: KWD_DP(recoveredToday),
            pendingLinksCount,
            dayIso: dayIsoLocal,
            branchId: branchId ?? null,
        };
    }
    async getDebtRecoveryReport(fromIso, toIso) {
        const todayUtc = new Date();
        todayUtc.setUTCHours(0, 0, 0, 0);
        const toDay = toIso ? parseDayUtc(toIso) : new Date(todayUtc);
        const fromDay = fromIso
            ? parseDayUtc(fromIso)
            : (() => {
                const d = new Date(toDay);
                d.setUTCDate(d.getUTCDate() - 29);
                return d;
            })();
        if (fromDay.getTime() > toDay.getTime()) {
            throw new common_1.BadRequestException('`from` must be on or before `to`');
        }
        const windowEnd = new Date(toDay);
        windowEnd.setUTCDate(windowEnd.getUTCDate() + 1);
        const rows = await this.prisma.transactionHistory.findMany({
            where: {
                createdAt: { gte: fromDay, lt: windowEnd },
                type: {
                    in: [
                        client_1.LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
                        client_1.LedgerTransactionType.SUBSCRIPTION_ACTIVATION,
                    ],
                },
            },
            select: {
                createdAt: true,
                type: true,
                metadata: true,
            },
            orderBy: { createdAt: 'asc' },
        });
        const buckets = new Map();
        for (let cursor = new Date(fromDay); cursor.getTime() <= toDay.getTime(); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
            const key = toIsoDay(cursor);
            buckets.set(key, {
                dayIso: key,
                recoveredKd: '0.0000',
                settlementCount: 0,
                subscriptionCount: 0,
            });
        }
        let total = new client_1.Prisma.Decimal(0);
        for (const r of rows) {
            const key = toIsoDay(r.createdAt);
            const bucket = buckets.get(key);
            if (!bucket)
                continue;
            const debtSettled = extractDebtSettled(r.metadata);
            total = total.plus(debtSettled);
            bucket.recoveredKd = FOUR_DP(new client_1.Prisma.Decimal(bucket.recoveredKd).plus(debtSettled));
            if (r.type === client_1.LedgerTransactionType.ORDER_WALLET_SETTLEMENT) {
                bucket.settlementCount += 1;
            }
            else {
                bucket.subscriptionCount += 1;
            }
        }
        return {
            from: toIsoDay(fromDay),
            to: toIsoDay(toDay),
            totalRecoveredKd: FOUR_DP(total),
            days: Array.from(buckets.values()),
        };
    }
    async previewSubscriptionRollover(customerId) {
        const customer = await this.prisma.customer.findUnique({
            where: { id: customerId },
            select: { id: true },
        });
        if (!customer) {
            throw new common_1.NotFoundException('Customer not found');
        }
        const [wallet, previous] = await Promise.all([
            this.prisma.customerWallet.findUnique({
                where: { customerId },
                select: { balance: true, debt: true },
            }),
            this.prisma.customerSubscription.findFirst({
                where: {
                    customerId,
                    status: {
                        in: [
                            client_1.CustomerSubscriptionStatus.ACTIVE,
                            client_1.CustomerSubscriptionStatus.EXPIRED,
                        ],
                    },
                },
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    planNameSnapshot: true,
                    activatedAt: true,
                    expiresAt: true,
                },
            }),
        ]);
        const balance = wallet?.balance ?? new client_1.Prisma.Decimal(0);
        const debt = wallet?.debt ?? new client_1.Prisma.Decimal(0);
        const carried = balance.minus(debt);
        if (!previous) {
            return {
                hasPrevious: false,
                currentWalletBalanceKd: balance.toFixed(4),
                currentWalletDebtKd: debt.toFixed(4),
            };
        }
        return {
            hasPrevious: true,
            carriedBalanceKd: carried.toFixed(4),
            previousPlanName: previous.planNameSnapshot,
            previousActivatedAtIso: previous.activatedAt.toISOString(),
            previousExpiresAtIso: previous.expiresAt.toISOString(),
            currentWalletBalanceKd: balance.toFixed(4),
            currentWalletDebtKd: debt.toFixed(4),
        };
    }
    async listCustomerSubscriptionChain(customerId) {
        const customer = await this.prisma.customer.findUnique({
            where: { id: customerId },
            select: { id: true },
        });
        if (!customer) {
            throw new common_1.NotFoundException('Customer not found');
        }
        const subs = await this.prisma.customerSubscription.findMany({
            where: { customerId },
            orderBy: { activatedAt: 'desc' },
        });
        if (subs.length === 0)
            return [];
        const ids = subs.map((s) => s.id);
        const orders = await this.prisma.order.findMany({
            where: { subscriptionId: { in: ids } },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                subscriptionId: true,
                invoiceNumber: true,
                totalPrice: true,
                status: true,
                cashStatus: true,
                createdAt: true,
                completedAt: true,
            },
        });
        const ordersBySub = new Map();
        for (const o of orders) {
            if (!o.subscriptionId)
                continue;
            const list = ordersBySub.get(o.subscriptionId) ?? [];
            list.push({
                orderId: o.id,
                invoiceNumber: o.invoiceNumber ?? undefined,
                totalPriceKd: o.totalPrice.toFixed(4),
                status: o.status,
                cashStatus: o.cashStatus,
                createdAtIso: o.createdAt.toISOString(),
                completedAtIso: o.completedAt?.toISOString(),
            });
            ordersBySub.set(o.subscriptionId, list);
        }
        return this.mapSubscriptionChainRows(subs, ordersBySub);
    }
    async recordPartialDebtPayment(customerId, dto, performedByUserId) {
        const method = dto.paymentMethod;
        return this.customerLedger.recordPartialDebtPayment({
            customerId,
            amountKd: dto.amountKd,
            discountKd: dto.discountKd,
            paymentMethod: method,
            performedByUserId,
            note: dto.note,
        });
    }
    mapSubscriptionChainRows(subs, ordersBySub) {
        return subs.map((s) => ({
            id: s.id,
            status: s.status,
            planNameSnapshot: s.planNameSnapshot,
            planSalePriceSnapshot: s.planSalePriceSnapshot.toFixed(4),
            planActualBalanceSnapshot: s.planActualBalanceSnapshot.toFixed(4),
            planValidityDaysSnapshot: s.planValidityDaysSnapshot,
            carriedBalanceKd: s.carriedBalanceKd.toFixed(4),
            parentSubscriptionId: s.parentSubscriptionId ?? undefined,
            activatedAtIso: s.activatedAt.toISOString(),
            expiresAtIso: s.expiresAt.toISOString(),
            closedAtIso: s.closedAt?.toISOString(),
            closedReason: s.closedReason ?? undefined,
            invoices: ordersBySub.get(s.id) ?? [],
        }));
    }
};
exports.CallCenterService = CallCenterService;
exports.CallCenterService = CallCenterService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        customer_ledger_service_1.CustomerLedgerService,
        payments_service_1.PaymentsService])
], CallCenterService);
//# sourceMappingURL=call-center.service.js.map