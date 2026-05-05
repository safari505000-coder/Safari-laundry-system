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
var RevenueMetricsCollector_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RevenueMetricsCollector = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const metrics_service_1 = require("./metrics.service");
let RevenueMetricsCollector = RevenueMetricsCollector_1 = class RevenueMetricsCollector {
    prisma;
    metrics;
    logger = new common_1.Logger(RevenueMetricsCollector_1.name);
    constructor(prisma, metrics) {
        this.prisma = prisma;
        this.metrics = metrics;
    }
    async collect() {
        if (process.env.DISABLE_REVENUE_METRICS_CRON === 'true') {
            return;
        }
        try {
            const row = await this.prisma.order.aggregate({
                where: {
                    status: client_1.OrderStatus.COMPLETED,
                    walletSettledAt: { not: null },
                },
                _sum: { totalPrice: true },
            });
            const raw = row._sum.totalPrice;
            const n = raw === null || raw === undefined ? 0 : Number(raw);
            this.metrics.setRevenueTotalKd(Number.isFinite(n) ? n : 0);
        }
        catch (error) {
            this.logger.warn(`revenue_metrics_failed ${error instanceof Error ? error.message : String(error)}`);
        }
    }
};
exports.RevenueMetricsCollector = RevenueMetricsCollector;
__decorate([
    (0, schedule_1.Interval)(60_000),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RevenueMetricsCollector.prototype, "collect", null);
exports.RevenueMetricsCollector = RevenueMetricsCollector = RevenueMetricsCollector_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        metrics_service_1.MetricsService])
], RevenueMetricsCollector);
//# sourceMappingURL=revenue-metrics.collector.js.map