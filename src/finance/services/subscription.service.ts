import { Injectable } from '@nestjs/common';
import { LedgerTransactionType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SubscriptionService {
  constructor(private readonly prisma: PrismaService) {}

  async getUsageAndSettledDebtTotals(): Promise<{
    totalSubscriptionUsage: string;
    debtSettledBySubscriptions: string;
  }> {
    const txRows = await this.prisma.transactionHistory.findMany({
      where: {
        OR: [
          { type: LedgerTransactionType.ORDER_WALLET_SETTLEMENT },
          { type: LedgerTransactionType.SUBSCRIPTION_ACTIVATION },
        ],
      },
      select: { type: true, metadata: true },
    });
    let usage = 0;
    let settled = 0;
    for (const row of txRows) {
      const meta = row.metadata as
        | { debtSettled?: unknown; appliedFromWallet?: unknown }
        | null
        | undefined;
      if (row.type === LedgerTransactionType.ORDER_WALLET_SETTLEMENT) {
        const n = Number.parseFloat(String(meta?.appliedFromWallet ?? '0'));
        if (Number.isFinite(n) && n > 0) usage += n;
      } else if (row.type === LedgerTransactionType.SUBSCRIPTION_ACTIVATION) {
        const n = Number.parseFloat(String(meta?.debtSettled ?? '0'));
        if (Number.isFinite(n) && n > 0) settled += n;
      }
    }
    return {
      totalSubscriptionUsage: usage.toFixed(4),
      debtSettledBySubscriptions: settled.toFixed(4),
    };
  }
}

