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

  async getCustomerSubscriptionSnapshot(customerId: string): Promise<{
    walletBalance: string;
    subscriptionPlanId: string | null;
    subscriptionPlanName: string | null;
    subscriptionActivatedAt: string | null;
    subscriptionExpiresAt: string | null;
    totalSubscriptionUsage: string;
    debtSettledBySubscriptions: string;
  }> {
    const wallet = await this.prisma.customerWallet.findUnique({
      where: { customerId },
      select: {
        balance: true,
        subscriptionPlanId: true,
        subscriptionPlanName: true,
        subscriptionActivatedAt: true,
        subscriptionExpiresAt: true,
      },
    });
    const txRows = await this.prisma.transactionHistory.findMany({
      where: {
        customerId,
        OR: [
          { type: LedgerTransactionType.ORDER_WALLET_SETTLEMENT },
          { type: LedgerTransactionType.SUBSCRIPTION_ACTIVATION },
        ],
      },
      select: { type: true, metadata: true },
      take: 5000,
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
      walletBalance: wallet?.balance?.toString?.() ?? '0.0000',
      subscriptionPlanId: wallet?.subscriptionPlanId ?? null,
      subscriptionPlanName: wallet?.subscriptionPlanName ?? null,
      subscriptionActivatedAt: wallet?.subscriptionActivatedAt?.toISOString() ?? null,
      subscriptionExpiresAt: wallet?.subscriptionExpiresAt?.toISOString() ?? null,
      totalSubscriptionUsage: usage.toFixed(4),
      debtSettledBySubscriptions: settled.toFixed(4),
    };
  }
}

