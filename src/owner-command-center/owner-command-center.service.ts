import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { statfs } from 'node:fs/promises';
import * as os from 'node:os';
import { AuditStatus, OrderStatus, Prisma } from '@prisma/client';
import {
  DISCORD_ALERT_QUEUE,
  discordRedisConnection,
} from '../common/services/discord-alert.queue';
import { ReadinessService } from '../health/readiness.service';
import { PrismaService } from '../prisma/prisma.service';

const FIFTEEN_MIN_MS = 15 * 60_000;
const ONE_DAY_MS = 24 * 60 * 60_000;

function decToNum(value: Prisma.Decimal | null | undefined): number {
  if (value == null) return 0;
  return Number(value.toString());
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

@Injectable()
export class OwnerCommandCenterService {
  private readonly logger = new Logger(OwnerCommandCenterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly readiness: ReadinessService,
  ) {}

  // ---------------------------------------------------------------------------
  // 1) SYSTEM HEALTH
  // ---------------------------------------------------------------------------

  async getSystemHealth() {
    const [readiness, queue, errorRate, activity, disk] = await Promise.all([
      this.readiness.check().catch(() => ({
        ok: false,
        checks: { database: false, redis: false, queue: false },
        region: 'unknown',
        deploymentColor: 'unknown',
      })),
      this.getQueueHealth(),
      this.getApiErrorRate(),
      this.getActivity(),
      this.getDiskUsage(),
    ]);

    const mem = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    const alerts: string[] = [];
    if (!readiness.checks.database) alerts.push('DATABASE_DOWN');
    if (!readiness.checks.redis) alerts.push('REDIS_DOWN');
    if (!readiness.checks.queue) alerts.push('QUEUE_DOWN');
    if (queue.failed > 0) alerts.push(`QUEUE_FAILED_JOBS:${queue.failed}`);

    return {
      ok: readiness.ok && queue.failed === 0,
      generatedAt: new Date().toISOString(),
      region: readiness.region,
      deploymentColor: readiness.deploymentColor,
      uptimeSeconds: Math.round(process.uptime()),
      database: { status: readiness.checks.database ? 'UP' : 'DOWN' },
      redis: { status: readiness.checks.redis ? 'UP' : 'DOWN' },
      queue: {
        status: readiness.checks.queue ? 'UP' : 'DOWN',
        name: DISCORD_ALERT_QUEUE,
        counts: queue.counts,
      },
      failedJobs: queue.failed,
      apiErrorRate: errorRate,
      activeUsers: activity.activeUsers15m,
      activeSessions: activity.activeSessions,
      disk,
      memory: {
        processRssBytes: mem.rss,
        heapUsedBytes: mem.heapUsed,
        heapTotalBytes: mem.heapTotal,
        systemTotalBytes: totalMem,
        systemFreeBytes: freeMem,
        systemUsedPct: totalMem > 0 ? round2(((totalMem - freeMem) / totalMem) * 100) : 0,
      },
      alerts,
    };
  }

  private async getQueueHealth(): Promise<{
    failed: number;
    counts: Record<string, number>;
  }> {
    const conn = discordRedisConnection();
    if (!conn) {
      return { failed: 0, counts: {} };
    }
    const queue = new Queue(DISCORD_ALERT_QUEUE, { connection: conn });
    try {
      const counts = await queue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
        'paused',
      );
      return { failed: counts.failed ?? 0, counts };
    } catch (error) {
      this.logger.warn(
        `queue_health_failed reason=${error instanceof Error ? error.message : String(error)}`,
      );
      return { failed: 0, counts: {} };
    } finally {
      await queue.close().catch(() => undefined);
    }
  }

  private async getApiErrorRate(): Promise<{
    windowMinutes: number;
    total: number;
    denied: number;
    deniedRatePct: number;
  }> {
    const since = new Date(Date.now() - FIFTEEN_MIN_MS);
    const [total, denied] = await Promise.all([
      this.prisma.auditLog.count({ where: { createdAt: { gte: since } } }),
      this.prisma.auditLog.count({
        where: { createdAt: { gte: since }, status: AuditStatus.DENIED },
      }),
    ]);
    return {
      windowMinutes: 15,
      total,
      denied,
      deniedRatePct: total > 0 ? round2((denied / total) * 100) : 0,
    };
  }

  private async getActivity(): Promise<{
    activeUsers15m: number;
    activeSessions: number;
  }> {
    const since = new Date(Date.now() - FIFTEEN_MIN_MS);
    const now = new Date();
    const [distinct, sessions] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { createdAt: { gte: since }, userId: { not: null } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.userSession.count({
        where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      }),
    ]);
    return { activeUsers15m: distinct.length, activeSessions: sessions };
  }

  private async getDiskUsage(): Promise<{
    available: boolean;
    totalBytes: number;
    freeBytes: number;
    usedPct: number;
  }> {
    try {
      const stats = await statfs(process.cwd());
      const total = stats.blocks * stats.bsize;
      const free = stats.bavail * stats.bsize;
      return {
        available: true,
        totalBytes: total,
        freeBytes: free,
        usedPct: total > 0 ? round2(((total - free) / total) * 100) : 0,
      };
    } catch {
      return { available: false, totalBytes: 0, freeBytes: 0, usedPct: 0 };
    }
  }

  // ---------------------------------------------------------------------------
  // 2) OWNER COMMAND CENTER (executive snapshot — read-only)
  // ---------------------------------------------------------------------------

  async getCommandCenter() {
    const since24h = new Date(Date.now() - ONE_DAY_MS);
    const [
      dailyRevenue,
      outstandingDebt,
      custody,
      deposits,
      payroll,
      failedPayments,
      security,
      health,
      accountingIntegrity,
    ] = await Promise.all([
      this.getDailyRevenue(),
      this.getOutstandingDebt(),
      this.getDriverCustody(),
      this.getPendingDeposits(),
      this.getPayrollDue(),
      this.prisma.journalFailureLog.count({ where: { createdAt: { gte: since24h } } }),
      this.getSecurityAlerts(since24h),
      this.getSystemHealth(),
      this.getAccountingIntegrity(),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      currency: 'KWD',
      dailyRevenue,
      outstandingDebts: outstandingDebt,
      driverCustody: custody,
      pendingDeposits: deposits,
      payrollDue: payroll,
      failedPayments: { last24h: failedPayments },
      securityAlerts: security,
      accountingIntegrity,
      systemAlerts: {
        ok: health.ok,
        alerts: health.alerts,
        database: health.database.status,
        redis: health.redis.status,
        queue: health.queue.status,
        failedJobs: health.failedJobs,
      },
    };
  }

  /**
   * FINANCIAL HARDENING — latest persisted accounting-integrity verdict.
   * Read directly from the append-only DailyAccountingIntegrityReport so
   * the command center surfaces ledger drift / unbalanced entries / broken
   * chains without coupling to the financial-integrity module.
   */
  private async getAccountingIntegrity(): Promise<{
    status: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
    generatedAt: string | null;
    criticalCount: number;
    warningCount: number;
    driftCount: number;
  }> {
    try {
      const row = await this.prisma.dailyAccountingIntegrityReport.findFirst({
        orderBy: { generatedAt: 'desc' },
        select: {
          status: true,
          generatedAt: true,
          criticalCount: true,
          warningCount: true,
          driftCount: true,
        },
      });
      if (!row) {
        return {
          status: 'UNKNOWN',
          generatedAt: null,
          criticalCount: 0,
          warningCount: 0,
          driftCount: 0,
        };
      }
      return {
        status: row.status as 'HEALTHY' | 'WARNING' | 'CRITICAL',
        generatedAt: row.generatedAt.toISOString(),
        criticalCount: row.criticalCount,
        warningCount: row.warningCount,
        driftCount: row.driftCount,
      };
    } catch {
      return {
        status: 'UNKNOWN',
        generatedAt: null,
        criticalCount: 0,
        warningCount: 0,
        driftCount: 0,
      };
    }
  }

  private async getDailyRevenue(): Promise<{ kd: number; orders: number }> {
    const start = startOfTodayUtc();
    const agg = await this.prisma.order.aggregate({
      where: { status: OrderStatus.COMPLETED, completedAt: { gte: start } },
      _sum: { totalPrice: true },
      _count: true,
    });
    return { kd: round2(decToNum(agg._sum.totalPrice)), orders: agg._count };
  }

  private async getOutstandingDebt(): Promise<{ kd: number; customers: number }> {
    const agg = await this.prisma.financialSnapshot.aggregate({
      where: { remainingDebtKd: { gt: 0 } },
      _sum: { remainingDebtKd: true },
      _count: true,
    });
    return { kd: round2(decToNum(agg._sum.remainingDebtKd)), customers: agg._count };
  }

  private async getDriverCustody(): Promise<{
    outstandingKd: number;
    byStatus: Array<{ status: string; kd: number; count: number }>;
  }> {
    const groups = await this.prisma.managerCashCustody.groupBy({
      by: ['status'],
      _sum: { amountKd: true },
      _count: true,
    });
    const byStatus = groups.map((g) => ({
      status: String(g.status),
      kd: round2(decToNum(g._sum.amountKd)),
      count: g._count,
    }));
    const outstandingKd = byStatus
      .filter((g) => !/VERIFIED|REJECTED/.test(g.status))
      .reduce((sum, g) => sum + g.kd, 0);
    return { outstandingKd: round2(outstandingKd), byStatus };
  }

  private async getPendingDeposits(): Promise<{
    pendingKd: number;
    pendingCount: number;
    byStatus: Array<{ status: string; kd: number; count: number }>;
  }> {
    const groups = await this.prisma.bankDepositLog.groupBy({
      by: ['status'],
      _sum: { amountKd: true },
      _count: true,
    });
    const byStatus = groups.map((g) => ({
      status: String(g.status),
      kd: round2(decToNum(g._sum.amountKd)),
      count: g._count,
    }));
    const pending = byStatus.find((g) => g.status === 'PENDING');
    return {
      pendingKd: pending?.kd ?? 0,
      pendingCount: pending?.count ?? 0,
      byStatus,
    };
  }

  private async getPayrollDue(): Promise<{
    pendingCount: number;
    pendingBasicKd: number;
    byStatus: Array<{ status: string; count: number }>;
  }> {
    const groups = await this.prisma.payroll.groupBy({
      by: ['status'],
      _sum: { basicSalary: true },
      _count: true,
    });
    const byStatus = groups.map((g) => ({ status: String(g.status), count: g._count }));
    const pending = groups.find((g) => String(g.status) === 'PENDING');
    return {
      pendingCount: pending?._count ?? 0,
      pendingBasicKd: round2(decToNum(pending?._sum.basicSalary ?? null)),
      byStatus,
    };
  }

  private async getSecurityAlerts(since: Date): Promise<{
    suspicious24h: number;
    denied24h: number;
    recent: Array<{ action: string; status: string; createdAt: string }>;
  }> {
    const [suspicious, denied, recent] = await Promise.all([
      this.prisma.auditLog.count({
        where: { createdAt: { gte: since }, suspicious: true },
      }),
      this.prisma.auditLog.count({
        where: { createdAt: { gte: since }, status: AuditStatus.DENIED },
      }),
      this.prisma.auditLog.findMany({
        where: {
          createdAt: { gte: since },
          OR: [{ suspicious: true }, { status: AuditStatus.DENIED }],
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { action: true, status: true, createdAt: true },
      }),
    ]);
    return {
      suspicious24h: suspicious,
      denied24h: denied,
      recent: recent.map((r) => ({
        action: r.action,
        status: String(r.status),
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
