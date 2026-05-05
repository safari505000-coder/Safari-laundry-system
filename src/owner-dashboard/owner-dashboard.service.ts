import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import {
  DISCORD_ALERT_DLQ_QUEUE,
  DISCORD_ALERT_QUEUE,
  discordRedisConnection,
} from '../common/services/discord-alert.queue';
import { kuwaitMidnightUtc } from '../common/time/kuwait-time';
import { WHATSAPP_DLQ_QUEUE, WHATSAPP_QUEUE } from '../customer-notifications/whatsapp.queue';
import { ReadinessService } from '../health/readiness.service';
import { MetricsService } from '../observability/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  OwnerDashboardCacheResponseDto,
  OwnerDashboardResponseDto,
  OwnerDashboardStatus,
} from './dto/owner-dashboard-response.dto';
import {
  OWNER_DASHBOARD_CACHE_KEY,
  OWNER_DASHBOARD_CACHE_TTL_SEC,
  OWNER_DASHBOARD_STALE_CACHE_KEY,
  OWNER_DASHBOARD_STALE_CACHE_TTL_SEC,
} from './owner-dashboard.queue';

const QUEUE_WARNING_THRESHOLD = 100;
const FAILURE_RATE_CRITICAL = 0.05;

@Injectable()
export class OwnerDashboardService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OwnerDashboardService.name);
  private redis: Redis | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly readiness: ReadinessService,
  ) {}

  onModuleInit(): void {
    const raw =
      process.env.REDIS_URL ??
      process.env.BULLMQ_REDIS_URL ??
      process.env.REDIS_PUBLIC_URL ??
      '';
    if (!raw.trim()) {
      return;
    }
    this.redis = new Redis(raw, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    void this.redis.connect().catch(() => {
      this.redis = null;
    });
  }

  onModuleDestroy(): void {
    void this.redis?.quit().catch(() => undefined);
    this.redis = null;
  }

  async getCachedDashboard(): Promise<OwnerDashboardCacheResponseDto> {
    const client = this.redis;
    if (!client) {
      return this.loadingCache();
    }
    try {
      const raw = await client.get(OWNER_DASHBOARD_CACHE_KEY);
      if (raw) {
        return this.parseCachedDashboard(raw);
      }
      const staleRaw = await client.get(OWNER_DASHBOARD_STALE_CACHE_KEY);
      return staleRaw ? this.parseCachedDashboard(staleRaw, 'stale') : this.loadingCache();
    } catch {
      return this.loadingCache();
    }
  }

  async refreshDashboard(): Promise<OwnerDashboardResponseDto> {
    const started = performance.now();
    const [business, queues, health] = await Promise.all([
      this.businessSnapshot(),
      this.queueSnapshot(),
      this.readiness.check().catch(() => ({ ok: false })),
    ]);
    const payments = this.metrics.paymentSnapshot();
    const failureRate =
      payments.successCount + payments.failureCount > 0 ?
        payments.failureCount / (payments.successCount + payments.failureCount)
      : 0;

    const activeAlerts =
      (health.ok ? 0 : 1) +
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

    const dashboard: OwnerDashboardResponseDto = {
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
      this.logger.warn(
        JSON.stringify({
          event: 'owner_dashboard_refresh_slow',
          traceId: undefined,
          orderId: undefined,
          durationMs: Math.round(ms),
        }),
      );
    }
    return dashboard;
  }

  private async writeCache(payload: OwnerDashboardCacheResponseDto): Promise<void> {
    const client = this.redis;
    if (!client) {
      throw new Error('owner_dashboard_cache_unavailable');
    }
    await client.set(
      OWNER_DASHBOARD_CACHE_KEY,
      JSON.stringify(payload),
      'EX',
      OWNER_DASHBOARD_CACHE_TTL_SEC,
    );
    await client.set(
      OWNER_DASHBOARD_STALE_CACHE_KEY,
      JSON.stringify(payload),
      'EX',
      OWNER_DASHBOARD_STALE_CACHE_TTL_SEC,
    );
  }

  private parseCachedDashboard(
    raw: string,
    forceStatus?: 'stale',
  ): OwnerDashboardCacheResponseDto {
    try {
      const parsed = JSON.parse(raw) as OwnerDashboardCacheResponseDto;
      if (
        parsed?.status === 'ready' &&
        parsed.data?.systemStatus &&
        parsed.data.payments &&
        parsed.data.orders &&
        typeof parsed.lastUpdated === 'string'
      ) {
        return forceStatus ? { ...parsed, status: forceStatus } : parsed;
      }
      return this.loadingCache();
    } catch {
      return this.loadingCache();
    }
  }

  private async businessSnapshot(): Promise<{
    revenueToday: number;
    revenueThisMonth: number;
    ordersToday: number;
    activeOrders: number;
  }> {
    const now = new Date();
    const todayStart = kuwaitMidnightUtc(now);
    const monthStart = this.kuwaitMonthStartUtc(now);
    const activeStatuses = [
      OrderStatus.PENDING,
      OrderStatus.PICKED_UP,
      OrderStatus.IN_PROGRESS,
      OrderStatus.OUT_FOR_DELIVERY,
    ];
    const [todayRevenue, monthRevenue, ordersToday, activeOrders] =
      await this.prisma.$transaction([
        this.prisma.order.aggregate({
          where: {
            status: OrderStatus.COMPLETED,
            walletSettledAt: { not: null },
            completedAt: { gte: todayStart },
          },
          _sum: { totalPrice: true },
        }),
        this.prisma.order.aggregate({
          where: {
            status: OrderStatus.COMPLETED,
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

  private async queueSnapshot(): Promise<{ waiting: number; failed: number }> {
    const connection = discordRedisConnection();
    if (!connection) {
      return { waiting: 0, failed: 0 };
    }
    const names = [
      { queue: DISCORD_ALERT_QUEUE, dlq: DISCORD_ALERT_DLQ_QUEUE },
      { queue: WHATSAPP_QUEUE, dlq: WHATSAPP_DLQ_QUEUE },
    ];
    let waiting = 0;
    let failed = 0;
    for (const name of names) {
      const queue = new Queue(name.queue, { connection });
      const dlq = new Queue(name.dlq, { connection });
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
      } finally {
        await Promise.all([
          queue.close().catch(() => undefined),
          dlq.close().catch(() => undefined),
        ]);
      }
    }
    return { waiting, failed };
  }

  private systemStatus(input: {
    healthOk: boolean;
    failureRate: number;
    waiting: number;
  }): OwnerDashboardStatus {
    if (!input.healthOk || input.failureRate > FAILURE_RATE_CRITICAL) {
      return 'critical';
    }
    if (input.waiting > QUEUE_WARNING_THRESHOLD) {
      return 'warning';
    }
    return 'healthy';
  }

  private alertMessage(input: {
    healthOk: boolean;
    failureRate: number;
    waiting: number;
    failed: number;
  }): string | undefined {
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

  private money(value: unknown): number {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0;
  }

  private kuwaitMonthStartUtc(nowUtc: Date): Date {
    const k = new Date(nowUtc.getTime() + 180 * 60_000);
    const utcMs =
      Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), 1, 0, 0, 0, 0) -
      180 * 60_000;
    return new Date(utcMs);
  }

  private loadingCache(): OwnerDashboardCacheResponseDto {
    return {
      status: 'loading',
      data: null,
      lastUpdated: null,
    };
  }
}
