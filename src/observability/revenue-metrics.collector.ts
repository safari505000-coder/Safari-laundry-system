import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from './metrics.service';

@Injectable()
export class RevenueMetricsCollector {
  private readonly logger = new Logger(RevenueMetricsCollector.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  @Interval(60_000)
  async collect(): Promise<void> {
    if (process.env.DISABLE_REVENUE_METRICS_CRON === 'true') {
      return;
    }
    try {
      const row = await this.prisma.order.aggregate({
        where: {
          status: OrderStatus.COMPLETED,
          walletSettledAt: { not: null },
        },
        _sum: { totalPrice: true },
      });
      const raw = row._sum.totalPrice;
      const n = raw === null || raw === undefined ? 0 : Number(raw);
      this.metrics.setRevenueTotalKd(Number.isFinite(n) ? n : 0);
    } catch (error) {
      this.logger.warn(
        `revenue_metrics_failed ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
