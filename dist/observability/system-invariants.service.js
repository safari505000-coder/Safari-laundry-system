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
var SystemInvariantsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemInvariantsService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const client_1 = require("@prisma/client");
const discord_alert_service_1 = require("../common/services/discord-alert.service");
const prisma_service_1 = require("../prisma/prisma.service");
let SystemInvariantsService = SystemInvariantsService_1 = class SystemInvariantsService {
    prisma;
    discord;
    logger = new common_1.Logger(SystemInvariantsService_1.name);
    constructor(prisma, discord) {
        this.prisma = prisma;
        this.discord = discord;
    }
    async check() {
        await this.negativeWallets();
        await this.duplicateTransactionHints();
    }
    async negativeWallets() {
        const bad = await this.prisma.customerWallet.findMany({
            where: {
                OR: [
                    { balance: { lt: new client_1.Prisma.Decimal(0) } },
                    { debt: { lt: new client_1.Prisma.Decimal(0) } },
                ],
            },
            select: { customerId: true, balance: true, debt: true },
            take: 20,
        });
        for (const w of bad) {
            this.logger.error(JSON.stringify({
                event: 'invariant_negative_wallet',
                traceId: undefined,
                orderId: undefined,
                customerId: w.customerId,
                balance: w.balance.toString(),
                debt: w.debt.toString(),
            }));
            this.discord.enqueue('invariant_violation', {
                invariant: 'wallet_non_negative',
                customerId: w.customerId,
                timestamp: Date.now(),
            });
        }
    }
    async duplicateTransactionHints() {
        const dups = await this.prisma.$queryRaw `
      SELECT "orderId", COUNT(*)::bigint AS c
      FROM "TransactionHistory"
      WHERE "orderId" IS NOT NULL
        AND "createdAt" > NOW() - INTERVAL '24 hours'
      GROUP BY "orderId", "type", amount
      HAVING COUNT(*) > 1
      LIMIT 15
    `;
        for (const d of dups) {
            this.logger.error(JSON.stringify({
                event: 'invariant_duplicate_tx_hint',
                traceId: undefined,
                orderId: d.orderId,
                count: Number(d.c),
            }));
            this.discord.enqueue('invariant_violation', {
                invariant: 'duplicate_transaction_shape',
                orderId: d.orderId,
                count: Number(d.c),
                timestamp: Date.now(),
            });
        }
    }
};
exports.SystemInvariantsService = SystemInvariantsService;
__decorate([
    (0, schedule_1.Interval)(300_000),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SystemInvariantsService.prototype, "check", null);
exports.SystemInvariantsService = SystemInvariantsService = SystemInvariantsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        discord_alert_service_1.DiscordAlertService])
], SystemInvariantsService);
//# sourceMappingURL=system-invariants.service.js.map