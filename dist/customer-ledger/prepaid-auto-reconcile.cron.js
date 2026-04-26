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
var PrepaidAutoReconcileCronService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrepaidAutoReconcileCronService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const client_1 = require("@prisma/client");
const kuwait_time_1 = require("../common/time/kuwait-time");
const prisma_service_1 = require("../prisma/prisma.service");
const customer_ledger_service_1 = require("./customer-ledger.service");
let PrepaidAutoReconcileCronService = PrepaidAutoReconcileCronService_1 = class PrepaidAutoReconcileCronService {
    prisma;
    ledger;
    logger = new common_1.Logger(PrepaidAutoReconcileCronService_1.name);
    constructor(prisma, ledger) {
        this.prisma = prisma;
        this.ledger = ledger;
    }
    async handleCron() {
        if (process.env.PREPAID_AUTO_RECONCILE_CRON_DISABLED === 'true') {
            return;
        }
        try {
            const candidates = await this.prisma.order.findMany({
                where: {
                    cashStatus: client_1.CashStatus.UNPAID,
                    status: { not: client_1.OrderStatus.CANCELED },
                    walletSettledAt: null,
                    posPaymentBundleId: null,
                    customer: {
                        wallet: {
                            balance: { gt: new client_1.Prisma.Decimal(0) },
                        },
                    },
                },
                distinct: ['customerId'],
                orderBy: { customerId: 'asc' },
                select: { customerId: true },
                take: 250,
            });
            if (candidates.length === 0) {
                return;
            }
            let invoicesSettled = 0;
            let customersTouched = 0;
            for (const { customerId } of candidates) {
                const { paidOrderIds } = await this.ledger.runPrepaidAutoReconcileForCustomer(customerId, null);
                if (paidOrderIds.length > 0) {
                    customersTouched += 1;
                    invoicesSettled += paidOrderIds.length;
                }
            }
            if (invoicesSettled > 0) {
                this.logger.log(`[prepaid-auto-reconcile cron] settled ${invoicesSettled} invoice(s) for ${customersTouched} customer(s) (batch scanned=${candidates.length})`);
            }
        }
        catch (e) {
            this.logger.error('[prepaid-auto-reconcile cron] failed', e);
        }
    }
};
exports.PrepaidAutoReconcileCronService = PrepaidAutoReconcileCronService;
__decorate([
    (0, schedule_1.Cron)('*/15 * * * *', {
        name: 'prepaid-auto-reconcile',
        timeZone: kuwait_time_1.KUWAIT_TIMEZONE,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PrepaidAutoReconcileCronService.prototype, "handleCron", null);
exports.PrepaidAutoReconcileCronService = PrepaidAutoReconcileCronService = PrepaidAutoReconcileCronService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        customer_ledger_service_1.CustomerLedgerService])
], PrepaidAutoReconcileCronService);
//# sourceMappingURL=prepaid-auto-reconcile.cron.js.map