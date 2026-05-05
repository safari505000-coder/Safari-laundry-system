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
var PaymentConsistencyWatchdogService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentConsistencyWatchdogService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const client_1 = require("@prisma/client");
const discord_alert_queue_1 = require("../common/services/discord-alert.queue");
const discord_alert_service_1 = require("../common/services/discord-alert.service");
const app_version_1 = require("../common/constants/app-version");
const prisma_service_1 = require("../prisma/prisma.service");
let PaymentConsistencyWatchdogService = PaymentConsistencyWatchdogService_1 = class PaymentConsistencyWatchdogService {
    prisma;
    discordAlerts;
    logger = new common_1.Logger(PaymentConsistencyWatchdogService_1.name);
    constructor(prisma, discordAlerts) {
        this.prisma = prisma;
        this.discordAlerts = discordAlerts;
    }
    async check() {
        const rows = await this.prisma.order.findMany({
            where: {
                status: client_1.OrderStatus.COMPLETED,
                walletSettledAt: null,
            },
            select: {
                id: true,
                posGatewayTrackId: true,
                updatedAt: true,
            },
            take: 25,
            orderBy: { updatedAt: 'asc' },
        });
        if (rows.length === 0) {
            return;
        }
        this.logger.error(`payment_consistency_watchdog_found count=${rows.length}`);
        for (const row of rows) {
            this.discordAlerts.enqueue(discord_alert_queue_1.PAYMENT_CONSISTENCY_CRITICAL_EVENT, {
                orderId: row.id,
                trackId: row.posGatewayTrackId,
                version: app_version_1.APP_VERSION,
                issue: 'completed_without_wallet_settlement',
                timestamp: Date.now(),
            });
        }
    }
};
exports.PaymentConsistencyWatchdogService = PaymentConsistencyWatchdogService;
__decorate([
    (0, schedule_1.Cron)('0 */3 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PaymentConsistencyWatchdogService.prototype, "check", null);
exports.PaymentConsistencyWatchdogService = PaymentConsistencyWatchdogService = PaymentConsistencyWatchdogService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        discord_alert_service_1.DiscordAlertService])
], PaymentConsistencyWatchdogService);
//# sourceMappingURL=payment-consistency-watchdog.service.js.map