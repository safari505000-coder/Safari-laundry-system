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
var CommissionEarningCron_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommissionEarningCron = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const system_settings_service_1 = require("../system-settings/system-settings.service");
const commission_earning_service_1 = require("./commission-earning.service");
let CommissionEarningCron = class CommissionEarningCron {
    static { CommissionEarningCron_1 = this; }
    prisma;
    earning;
    settings;
    logger = new common_1.Logger(CommissionEarningCron_1.name);
    static SCAN_MINUTES = 30;
    constructor(prisma, earning, settings) {
        this.prisma = prisma;
        this.earning = earning;
        this.settings = settings;
    }
    async scan() {
        const enabled = await this.settings.isEnabled(client_1.SystemToggleKey.COMMISSION);
        if (!enabled)
            return;
        const since = new Date(Date.now() - CommissionEarningCron_1.SCAN_MINUTES * 60_000);
        try {
            await this.scanCompletedOrders(since);
        }
        catch (err) {
            this.logger.error(`SALE scan failed: ${err.message}`, err.stack);
        }
        try {
            await this.scanDebtPayments(since);
        }
        catch (err) {
            this.logger.error(`COLLECTION scan failed: ${err.message}`, err.stack);
        }
        try {
            await this.releaseAfterCollection(since);
        }
        catch (err) {
            this.logger.error(`AFTER_COLLECTION release failed: ${err.message}`, err.stack);
        }
    }
    async scanEndOfMonth() {
        const enabled = await this.settings.isEnabled(client_1.SystemToggleKey.COMMISSION);
        if (!enabled)
            return;
        const count = await this.earning.releaseEndOfMonth(new Date());
        if (count > 0) {
            this.logger.log(`Released ${count} END_OF_MONTH commission payouts`);
        }
    }
    async scanCompletedOrders(since) {
        const orders = await this.prisma.order.findMany({
            where: {
                status: client_1.OrderStatus.COMPLETED,
                completedAt: { gte: since },
            },
            select: { id: true },
            take: 500,
        });
        if (orders.length === 0)
            return;
        let earned = 0;
        for (const o of orders) {
            try {
                await this.earning.earnForOrder(o.id);
                earned++;
            }
            catch (err) {
                this.logger.warn(`earnForOrder(${o.id}) failed: ${err.message}`);
            }
        }
        this.logger.debug(`SALE scan processed ${orders.length} orders (earned ${earned})`);
    }
    async scanDebtPayments(since) {
        const entries = await this.prisma.debtLedgerEntry.findMany({
            where: {
                source: client_1.DebtSource.PAYMENT,
                orderId: { not: null },
                createdAt: { gte: since },
            },
            select: { id: true },
            take: 500,
        });
        if (entries.length === 0)
            return;
        let earned = 0;
        for (const e of entries) {
            try {
                await this.earning.earnForDebtPayment(e.id);
                earned++;
            }
            catch (err) {
                this.logger.warn(`earnForDebtPayment(${e.id}) failed: ${err.message}`);
            }
        }
        this.logger.debug(`COLLECTION scan processed ${entries.length} PAYMENTs (earned ${earned})`);
    }
    async releaseAfterCollection(since) {
        const candidates = await this.prisma.commissionPayout.findMany({
            where: {
                mode: client_1.CommissionMode.SALE,
                status: 'PENDING',
                rule: { payoutTiming: client_1.CommissionPayoutTiming.AFTER_COLLECTION },
                sourceOrderId: { not: null },
            },
            select: { sourceOrderId: true },
            distinct: ['sourceOrderId'],
            take: 200,
        });
        void since;
        for (const c of candidates) {
            if (!c.sourceOrderId)
                continue;
            const agg = await this.prisma.debtLedgerEntry.groupBy({
                by: ['source'],
                where: { orderId: c.sourceOrderId },
                _sum: { amount: true },
            });
            let created = 0;
            let paid = 0;
            for (const g of agg) {
                const amt = Number(g._sum.amount ?? 0);
                if (g.source === client_1.DebtSource.PAYMENT) {
                    paid += Math.abs(amt);
                }
                else {
                    created += Math.abs(amt);
                }
            }
            const open = created - paid;
            if (open <= 0) {
                await this.earning.releaseAfterCollectionForOrder(c.sourceOrderId);
            }
        }
    }
};
exports.CommissionEarningCron = CommissionEarningCron;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_10_MINUTES),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CommissionEarningCron.prototype, "scan", null);
__decorate([
    (0, schedule_1.Cron)('5 21 * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CommissionEarningCron.prototype, "scanEndOfMonth", null);
exports.CommissionEarningCron = CommissionEarningCron = CommissionEarningCron_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        commission_earning_service_1.CommissionEarningService,
        system_settings_service_1.SystemSettingsService])
], CommissionEarningCron);
//# sourceMappingURL=commission-earning.cron.js.map