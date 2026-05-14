import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OrderStatus } from '@prisma/client';
import {
  PAYMENT_CONSISTENCY_CRITICAL_EVENT,
} from '../common/services/discord-alert.queue';
import { DiscordAlertService } from '../common/services/discord-alert.service';
import { APP_VERSION } from '../common/constants/app-version';
import { PrismaService } from '../prisma/prisma.service';

/**
 * حارس اتساق المدفوعات — يفحص كل 3 دقائق الطلبات المكتملة التي لم تُسوَّ في المحفظة ويُرسل تنبيهاً.
 * Payment-consistency watchdog — runs every 3 minutes; alerts on COMPLETED orders with no wallet settlement.
 * Enqueues a Discord critical alert for each anomaly found.
 */
@Injectable()
export class PaymentConsistencyWatchdogService {
  private readonly logger = new Logger(PaymentConsistencyWatchdogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly discordAlerts: DiscordAlertService,
  ) {}

  @Cron('0 */3 * * * *')
  async check(): Promise<void> {
    const rows = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.COMPLETED,
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
      this.discordAlerts.enqueue(PAYMENT_CONSISTENCY_CRITICAL_EVENT, {
        orderId: row.id,
        trackId: row.posGatewayTrackId,
        version: APP_VERSION,
        issue: 'completed_without_wallet_settlement',
        timestamp: Date.now(),
      });
    }
  }
}
