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
var CommissionEarningService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommissionEarningService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const bank_fee_util_1 = require("../payment-method-fees/bank-fee.util");
const payment_method_fees_service_1 = require("../payment-method-fees/payment-method-fees.service");
const prisma_service_1 = require("../prisma/prisma.service");
const system_settings_service_1 = require("../system-settings/system-settings.service");
let CommissionEarningService = CommissionEarningService_1 = class CommissionEarningService {
    prisma;
    systemSettings;
    paymentMethodFees;
    logger = new common_1.Logger(CommissionEarningService_1.name);
    constructor(prisma, systemSettings, paymentMethodFees) {
        this.prisma = prisma;
        this.systemSettings = systemSettings;
        this.paymentMethodFees = paymentMethodFees;
    }
    async earnForOrder(orderId, tx) {
        const enabled = await this.systemSettings.isEnabled(client_1.SystemToggleKey.COMMISSION);
        if (!enabled)
            return;
        const db = tx ?? this.prisma;
        const order = await db.order.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                totalPrice: true,
                posPaymentMethod: true,
                subscriptionId: true,
                driverId: true,
                transferredFromDriverId: true,
                status: true,
            },
        });
        if (!order)
            return;
        const earnerUserId = order.transferredFromDriverId ?? order.driverId;
        if (!earnerUserId)
            return;
        const earner = await db.user.findUnique({
            where: { id: earnerUserId },
            select: { id: true, safariRole: true },
        });
        if (!earner)
            return;
        const rules = await this.pickActiveRules(db, client_1.CommissionMode.SALE, earner.safariRole);
        if (rules.length === 0)
            return;
        const feeConfig = await this.paymentMethodFees.getConfig();
        for (const rule of rules) {
            const basis = this.computeBasisForSale(order.totalPrice, order.posPaymentMethod, order.subscriptionId, rule.calculationBase, feeConfig);
            if (basis.isZero() || basis.isNegative())
                continue;
            if (basis.lessThan(rule.minInvoiceAmount))
                continue;
            const amount = basis.mul(rule.percentage).div(100);
            const releaseNow = rule.payoutTiming === client_1.CommissionPayoutTiming.IMMEDIATE;
            try {
                await db.commissionPayout.create({
                    data: {
                        ruleId: rule.id,
                        earnerUserId,
                        mode: client_1.CommissionMode.SALE,
                        basisAmount: basis.toFixed(4),
                        percentage: rule.percentage,
                        amount: amount.toFixed(4),
                        sourceOrderId: order.id,
                        status: releaseNow
                            ? client_1.CommissionPayoutStatus.RELEASED
                            : client_1.CommissionPayoutStatus.PENDING,
                        releasedAt: releaseNow ? new Date() : null,
                    },
                });
            }
            catch (err) {
                if (err instanceof client_1.Prisma.PrismaClientKnownRequestError &&
                    err.code === 'P2002') {
                    this.logger.debug(`SALE payout already exists for order=${order.id} rule=${rule.id}; skipping replay`);
                    continue;
                }
                throw err;
            }
        }
    }
    async earnForDebtPayment(debtEntryId, tx) {
        const enabled = await this.systemSettings.isEnabled(client_1.SystemToggleKey.COMMISSION);
        if (!enabled)
            return;
        const db = tx ?? this.prisma;
        const entry = await db.debtLedgerEntry.findUnique({
            where: { id: debtEntryId },
            select: {
                id: true,
                source: true,
                amount: true,
                orderId: true,
            },
        });
        if (!entry || entry.source !== client_1.DebtSource.PAYMENT)
            return;
        if (!entry.orderId)
            return;
        const order = await db.order.findUnique({
            where: { id: entry.orderId },
            select: {
                driverId: true,
                transferredFromDriverId: true,
            },
        });
        if (!order)
            return;
        const earnerUserId = order.transferredFromDriverId ?? order.driverId;
        if (!earnerUserId)
            return;
        const earner = await db.user.findUnique({
            where: { id: earnerUserId },
            select: { id: true, safariRole: true },
        });
        if (!earner)
            return;
        const rules = await this.pickActiveRules(db, client_1.CommissionMode.COLLECTION, earner.safariRole);
        if (rules.length === 0)
            return;
        const basis = new client_1.Prisma.Decimal(entry.amount.toString()).abs();
        for (const rule of rules) {
            if (basis.lessThan(rule.minInvoiceAmount))
                continue;
            const amount = basis.mul(rule.percentage).div(100);
            const releaseNow = rule.payoutTiming === client_1.CommissionPayoutTiming.IMMEDIATE;
            try {
                await db.commissionPayout.create({
                    data: {
                        ruleId: rule.id,
                        earnerUserId,
                        mode: client_1.CommissionMode.COLLECTION,
                        basisAmount: basis.toFixed(4),
                        percentage: rule.percentage,
                        amount: amount.toFixed(4),
                        sourceDebtEntryId: entry.id,
                        status: releaseNow
                            ? client_1.CommissionPayoutStatus.RELEASED
                            : client_1.CommissionPayoutStatus.PENDING,
                        releasedAt: releaseNow ? new Date() : null,
                    },
                });
            }
            catch (err) {
                if (err instanceof client_1.Prisma.PrismaClientKnownRequestError &&
                    err.code === 'P2002') {
                    this.logger.debug(`COLLECTION payout already exists for debtEntry=${entry.id} rule=${rule.id}; skipping replay`);
                    continue;
                }
                throw err;
            }
        }
    }
    async releaseAfterCollectionForOrder(orderId, tx) {
        const db = tx ?? this.prisma;
        const res = await db.commissionPayout.updateMany({
            where: {
                sourceOrderId: orderId,
                status: client_1.CommissionPayoutStatus.PENDING,
                rule: { payoutTiming: client_1.CommissionPayoutTiming.AFTER_COLLECTION },
            },
            data: {
                status: client_1.CommissionPayoutStatus.RELEASED,
                releasedAt: new Date(),
            },
        });
        return res.count;
    }
    async releaseEndOfMonth(asOf) {
        const res = await this.prisma.commissionPayout.updateMany({
            where: {
                status: client_1.CommissionPayoutStatus.PENDING,
                earnedAt: { lte: asOf },
                rule: { payoutTiming: client_1.CommissionPayoutTiming.END_OF_MONTH },
            },
            data: {
                status: client_1.CommissionPayoutStatus.RELEASED,
                releasedAt: new Date(),
            },
        });
        return res.count;
    }
    async cancelForOrder(orderId, reason) {
        const res = await this.prisma.commissionPayout.updateMany({
            where: {
                sourceOrderId: orderId,
                status: { not: client_1.CommissionPayoutStatus.PAID },
            },
            data: {
                status: client_1.CommissionPayoutStatus.CANCELLED,
                cancelledAt: new Date(),
                cancelReason: reason,
            },
        });
        return res.count;
    }
    async pickActiveRules(db, mode, earnerRole) {
        return db.commissionRule.findMany({
            where: {
                mode,
                isActive: true,
                OR: [{ role: null }, { role: earnerRole }],
            },
            orderBy: [{ role: 'desc' }, { updatedAt: 'desc' }],
        });
    }
    computeBasisForSale(totalPrice, posPaymentMethod, subscriptionId, base, feeConfig) {
        const gross = new client_1.Prisma.Decimal(totalPrice.toString());
        switch (base) {
            case client_1.CommissionCalculationBase.ORDER_TOTAL:
            case client_1.CommissionCalculationBase.INVOICE_TOTAL:
                return gross;
            case client_1.CommissionCalculationBase.NET_AFTER_KNET: {
                const fee = (0, bank_fee_util_1.computeOrderBankFeeKd)(gross, posPaymentMethod, feeConfig);
                return gross.sub(fee);
            }
            case client_1.CommissionCalculationBase.EXCLUDE_SUBSCRIPTIONS:
                return subscriptionId ? new client_1.Prisma.Decimal(0) : gross;
            default:
                return gross;
        }
    }
};
exports.CommissionEarningService = CommissionEarningService;
exports.CommissionEarningService = CommissionEarningService = CommissionEarningService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        system_settings_service_1.SystemSettingsService,
        payment_method_fees_service_1.PaymentMethodFeesService])
], CommissionEarningService);
//# sourceMappingURL=commission-earning.service.js.map