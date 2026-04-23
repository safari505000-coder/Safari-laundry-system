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
var StaleQuickOrdersCronService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StaleQuickOrdersCronService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const kuwait_time_1 = require("../common/time/kuwait-time");
const prisma_service_1 = require("../prisma/prisma.service");
const orders_service_1 = require("./orders.service");
const AUDIT_RESOURCE = '/orders/stale-quick-orders';
const AUDIT_ACTION_CLEAN = 'STALE_QUICK_ORDERS_CLEAN';
const AUDIT_ACTION_FLAG = 'STALE_QUICK_ORDERS_FLAGGED';
let StaleQuickOrdersCronService = StaleQuickOrdersCronService_1 = class StaleQuickOrdersCronService {
    prisma;
    orders;
    logger = new common_1.Logger(StaleQuickOrdersCronService_1.name);
    constructor(prisma, orders) {
        this.prisma = prisma;
        this.orders = orders;
    }
    async handleCron() {
        try {
            const risks = await this.orders.listStaleQuickOrderRisks();
            const count = risks.length;
            const totalKd = risks.reduce((sum, r) => sum + Number.parseFloat(r.amountKd), 0);
            const action = count === 0 ? AUDIT_ACTION_CLEAN : AUDIT_ACTION_FLAG;
            const payload = {
                scannedAt: new Date().toISOString(),
                count,
                totalKd: totalKd.toFixed(3),
                items: risks.map((r) => ({
                    orderId: r.orderId,
                    readableId: r.readableId,
                    driverName: r.driverName,
                    customerName: r.customerName,
                    amountKd: r.amountKd,
                    ageHours: r.ageHours,
                    paymentMethod: r.paymentMethod,
                })),
            };
            await this.prisma.auditLog.create({
                data: {
                    action,
                    resource: AUDIT_RESOURCE,
                    changes: payload,
                },
            });
            if (count === 0) {
                this.logger.log('Stale Quick-Order audit: no dangling invoices > 24h.');
            }
            else {
                this.logger.warn(`Stale Quick-Order audit: ${count} dangling invoice(s) totalling ${totalKd.toFixed(3)} KWD.`);
            }
        }
        catch (err) {
            this.logger.error('Stale Quick-Order audit failed', err instanceof Error ? err.stack : String(err));
        }
    }
};
exports.StaleQuickOrdersCronService = StaleQuickOrdersCronService;
__decorate([
    (0, schedule_1.Cron)('0 8 * * *', {
        name: 'stale-quick-orders-daily-audit',
        timeZone: kuwait_time_1.KUWAIT_TIMEZONE,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], StaleQuickOrdersCronService.prototype, "handleCron", null);
exports.StaleQuickOrdersCronService = StaleQuickOrdersCronService = StaleQuickOrdersCronService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        orders_service_1.OrdersService])
], StaleQuickOrdersCronService);
//# sourceMappingURL=stale-quick-orders.cron.js.map