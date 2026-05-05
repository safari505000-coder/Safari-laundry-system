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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var OwnerDashboardService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OwnerDashboardService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const discord_alert_queue_1 = require("../common/services/discord-alert.queue");
const kuwait_time_1 = require("../common/time/kuwait-time");
const whatsapp_queue_1 = require("../customer-notifications/whatsapp.queue");
const readiness_service_1 = require("../health/readiness.service");
const metrics_service_1 = require("../observability/metrics.service");
const prisma_service_1 = require("../prisma/prisma.service");
const owner_dashboard_queue_1 = require("./owner-dashboard.queue");
const QUEUE_WARNING_THRESHOLD = 100;
const FAILURE_RATE_CRITICAL = 0.05;
let OwnerDashboardService = OwnerDashboardService_1 = class OwnerDashboardService {
    prisma;
    metrics;
    readiness;
    logger = new common_1.Logger(OwnerDashboardService_1.name);
    redis = null;
    constructor(prisma, metrics, readiness) {
        this.prisma = prisma;
        this.metrics = metrics;
        this.readiness = readiness;
    }
    onModuleInit() {
        const raw = process.env.REDIS_URL ??
            process.env.BULLMQ_REDIS_URL ??
            process.env.REDIS_PUBLIC_URL ??
            '';
        if (!raw.trim()) {
            return;
        }
        this.redis = new ioredis_1.default(raw, {
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
            lazyConnect: true,
        });
        void this.redis.connect().catch(() => {
            this.redis = null;
        });
    }
    onModuleDestroy() {
        void this.redis?.quit().catch(() => undefined);
        this.redis = null;
    }
    async getCachedDashboard() {
        const client = this.redis;
        if (!client) {
            return this.loadingCache();
        }
        try {
            const raw = await client.get(owner_dashboard_queue_1.OWNER_DASHBOARD_CACHE_KEY);
            if (raw) {
                return this.parseCachedDashboard(raw);
            }
            const staleRaw = await client.get(owner_dashboard_queue_1.OWNER_DASHBOARD_STALE_CACHE_KEY);
            return staleRaw ? this.parseCachedDashboard(staleRaw, 'stale') : this.loadingCache();
        }
        catch {
            return this.loadingCache();
        }
    }
    async refreshDashboard() {
        const started = performance.now();
        const [business, queues, health] = await Promise.all([
            this.businessSnapshot(),
            this.queueSnapshot(),
            this.readiness.check().catch(() => ({ ok: false })),
        ]);
        const payments = this.metrics.paymentSnapshot();
        const failureRate = payments.successCount + payments.failureCount > 0 ?
            payments.failureCount / (payments.successCount + payments.failureCount)
            : 0;
        const activeAlerts = (health.ok ? 0 : 1) +
            (failureRate > FAILURE_RATE_CRITICAL ? 1 : 0) +
            (queues.waiting > QUEUE_WARNING_THRESHOLD ? 1 : 0) +
            (queues.failed > 0 ? 1 : 0);
        const lastMessage = this.alertMessage({
            healthOk: Boolean(health.ok),
            failureRate,
            waiting: queues.waiting,
            failed: queues.failed,
        });
        const systemStatus = this.systemStatus({
            healthOk: Boolean(health.ok),
            failureRate,
            waiting: queues.waiting,
        });
        const dashboard = {
            systemStatus,
            revenueToday: business.revenueToday,
            revenueThisMonth: business.revenueThisMonth,
            payments,
            orders: {
                today: business.ordersToday,
                active: business.activeOrders,
            },
            queues,
            alerts: {
                active: activeAlerts,
                ...(lastMessage ? { lastMessage } : {}),
            },
        };
        const lastUpdated = new Date().toISOString();
        await this.writeCache({
            status: 'ready',
            data: dashboard,
            lastUpdated,
        });
        const ms = performance.now() - started;
        if (ms > 200) {
            this.logger.warn(JSON.stringify({
                event: 'owner_dashboard_refresh_slow',
                traceId: undefined,
                orderId: undefined,
                durationMs: Math.round(ms),
            }));
        }
        return dashboard;
    }
    async writeCache(payload) {
        const client = this.redis;
        if (!client) {
            throw new Error('owner_dashboard_cache_unavailable');
        }
        await client.set(owner_dashboard_queue_1.OWNER_DASHBOARD_CACHE_KEY, JSON.stringify(payload), 'EX', owner_dashboard_queue_1.OWNER_DASHBOARD_CACHE_TTL_SEC);
        await client.set(owner_dashboard_queue_1.OWNER_DASHBOARD_STALE_CACHE_KEY, JSON.stringify(payload), 'EX', owner_dashboard_queue_1.OWNER_DASHBOARD_STALE_CACHE_TTL_SEC);
    }
    parseCachedDashboard(raw, forceStatus) {
        try {
            const parsed = JSON.parse(raw);
            if (parsed?.status === 'ready' &&
                parsed.data?.systemStatus &&
                parsed.data.payments &&
                parsed.data.orders &&
                typeof parsed.lastUpdated === 'string') {
                return forceStatus ? { ...parsed, status: forceStatus } : parsed;
            }
            return this.loadingCache();
        }
        catch {
            return this.loadingCache();
        }
    }
    async businessSnapshot() {
        const now = new Date();
        const todayStart = (0, kuwait_time_1.kuwaitMidnightUtc)(now);
        const monthStart = this.kuwaitMonthStartUtc(now);
        const activeStatuses = [
            client_1.OrderStatus.PENDING,
            client_1.OrderStatus.PICKED_UP,
            client_1.OrderStatus.IN_PROGRESS,
            client_1.OrderStatus.OUT_FOR_DELIVERY,
        ];
        const [todayRevenue, monthRevenue, ordersToday, activeOrders] = await this.prisma.$transaction([
            this.prisma.order.aggregate({
                where: {
                    status: client_1.OrderStatus.COMPLETED,
                    walletSettledAt: { not: null },
                    completedAt: { gte: todayStart },
                },
                _sum: { totalPrice: true },
            }),
            this.prisma.order.aggregate({
                where: {
                    status: client_1.OrderStatus.COMPLETED,
                    walletSettledAt: { not: null },
                    completedAt: { gte: monthStart },
                },
                _sum: { totalPrice: true },
            }),
            this.prisma.order.count({
                where: {
                    createdAt: { gte: todayStart },
                },
            }),
            this.prisma.order.count({
                where: {
                    status: { in: activeStatuses },
                },
            }),
        ]);
        return {
            revenueToday: this.money(todayRevenue._sum.totalPrice),
            revenueThisMonth: this.money(monthRevenue._sum.totalPrice),
            ordersToday,
            activeOrders,
        };
    }
    async queueSnapshot() {
        const connection = (0, discord_alert_queue_1.discordRedisConnection)();
        if (!connection) {
            return { waiting: 0, failed: 0 };
        }
        const names = [
            { queue: discord_alert_queue_1.DISCORD_ALERT_QUEUE, dlq: discord_alert_queue_1.DISCORD_ALERT_DLQ_QUEUE },
            { queue: whatsapp_queue_1.WHATSAPP_QUEUE, dlq: whatsapp_queue_1.WHATSAPP_DLQ_QUEUE },
        ];
        let waiting = 0;
        let failed = 0;
        for (const name of names) {
            const queue = new bullmq_1.Queue(name.queue, { connection });
            const dlq = new bullmq_1.Queue(name.dlq, { connection });
            try {
                const [mainCounts, dlqCounts] = await Promise.all([
                    queue.getJobCounts('waiting', 'delayed', 'failed'),
                    dlq.getJobCounts('waiting', 'delayed', 'failed'),
                ]);
                waiting +=
                    (mainCounts.waiting ?? 0) +
                        (mainCounts.delayed ?? 0) +
                        (dlqCounts.waiting ?? 0) +
                        (dlqCounts.delayed ?? 0);
                failed += (mainCounts.failed ?? 0) + (dlqCounts.failed ?? 0);
            }
            finally {
                await Promise.all([
                    queue.close().catch(() => undefined),
                    dlq.close().catch(() => undefined),
                ]);
            }
        }
        return { waiting, failed };
    }
    systemStatus(input) {
        if (!input.healthOk || input.failureRate > FAILURE_RATE_CRITICAL) {
            return 'critical';
        }
        if (input.waiting > QUEUE_WARNING_THRESHOLD) {
            return 'warning';
        }
        return 'healthy';
    }
    alertMessage(input) {
        if (!input.healthOk) {
            return 'System health needs attention.';
        }
        if (input.failureRate > FAILURE_RATE_CRITICAL) {
            return 'Payment failures are above the safe limit.';
        }
        if (input.waiting > QUEUE_WARNING_THRESHOLD) {
            return 'Background work is delayed.';
        }
        if (input.failed > 0) {
            return 'Some background tasks failed and need review.';
        }
        return 'All systems are operating normally.';
    }
    money(value) {
        const n = Number(value ?? 0);
        return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0;
    }
    kuwaitMonthStartUtc(nowUtc) {
        const k = new Date(nowUtc.getTime() + 180 * 60_000);
        const utcMs = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), 1, 0, 0, 0, 0) -
            180 * 60_000;
        return new Date(utcMs);
    }
    loadingCache() {
        return {
            status: 'loading',
            data: null,
            lastUpdated: null,
        };
    }
};
exports.OwnerDashboardService = OwnerDashboardService;
exports.OwnerDashboardService = OwnerDashboardService = OwnerDashboardService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        metrics_service_1.MetricsService,
        readiness_service_1.ReadinessService])
], OwnerDashboardService);
//# sourceMappingURL=owner-dashboard.service.js.map