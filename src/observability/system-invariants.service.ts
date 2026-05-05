import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { DiscordAlertService } from '../common/services/discord-alert.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SystemInvariantsService {
  private readonly logger = new Logger(SystemInvariantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly discord: DiscordAlertService,
  ) {}

  @Interval(300_000)
  async check(): Promise<void> {
    await this.negativeWallets();
    await this.duplicateTransactionHints();
  }

  private async negativeWallets(): Promise<void> {
    const bad = await this.prisma.customerWallet.findMany({
      where: {
        OR: [
          { balance: { lt: new Prisma.Decimal(0) } },
          { debt: { lt: new Prisma.Decimal(0) } },
        ],
      },
      select: { customerId: true, balance: true, debt: true },
      take: 20,
    });
    for (const w of bad) {
      this.logger.error(
        JSON.stringify({
          event: 'invariant_negative_wallet',
          traceId: undefined,
          orderId: undefined,
          customerId: w.customerId,
          balance: w.balance.toString(),
          debt: w.debt.toString(),
        }),
      );
      this.discord.enqueue('invariant_violation', {
        invariant: 'wallet_non_negative',
        customerId: w.customerId,
        timestamp: Date.now(),
      });
    }
  }

  /** Heuristic duplicate detection: same order + type + amount within narrow window (batch limited). */
  private async duplicateTransactionHints(): Promise<void> {
    const dups = await this.prisma.$queryRaw<
      Array<{ orderId: string; c: bigint }>
    >`
      SELECT "orderId", COUNT(*)::bigint AS c
      FROM "TransactionHistory"
      WHERE "orderId" IS NOT NULL
        AND "createdAt" > NOW() - INTERVAL '24 hours'
      GROUP BY "orderId", "type", amount
      HAVING COUNT(*) > 1
      LIMIT 15
    `;
    for (const d of dups) {
      this.logger.error(
        JSON.stringify({
          event: 'invariant_duplicate_tx_hint',
          traceId: undefined,
          orderId: d.orderId,
          count: Number(d.c),
        }),
      );
      this.discord.enqueue('invariant_violation', {
        invariant: 'duplicate_transaction_shape',
        orderId: d.orderId,
        count: Number(d.c),
        timestamp: Date.now(),
      });
    }
  }
}
