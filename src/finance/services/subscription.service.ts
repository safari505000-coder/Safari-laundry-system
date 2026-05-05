import { Injectable } from '@nestjs/common';
import { LedgerTransactionType, OrderStatus, PosPaymentMethod } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SubscriptionService {
  constructor(private readonly prisma: PrismaService) {}

  async getUsageAndSettledDebtTotals(): Promise<{
    totalSubscriptionUsage: string;
    debtSettledBySubscriptions: string;
  }> {
    const usageAgg = await this.prisma.order.aggregate({
      where: {
        status: { not: OrderStatus.CANCELED },
        posPaymentMethod: PosPaymentMethod.SUBSCRIPTION_WALLET,
      },
      _sum: { totalPrice: true },
    });
    const txRows = await this.prisma.transactionHistory.findMany({
      where: {
        type: LedgerTransactionType.SUBSCRIPTION_ACTIVATION,
      },
      select: { type: true, metadata: true },
    });
    let settled = 0;
    for (const row of txRows) {
      const meta = row.metadata as
        | { debtSettled?: unknown }
        | null
        | undefined;
      if (row.type === LedgerTransactionType.SUBSCRIPTION_ACTIVATION) {
        const n = Number.parseFloat(String(meta?.debtSettled ?? '0'));
        if (Number.isFinite(n) && n > 0) settled += n;
      }
    }
    return {
      totalSubscriptionUsage: (usageAgg._sum.totalPrice?.toNumber() ?? 0).toFixed(4),
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
    const usageAgg = await this.prisma.order.aggregate({
      where: {
        customerId,
        status: { not: OrderStatus.CANCELED },
        posPaymentMethod: PosPaymentMethod.SUBSCRIPTION_WALLET,
      },
      _sum: { totalPrice: true },
    });
    const txRows = await this.prisma.transactionHistory.findMany({
      where: {
        customerId,
        type: LedgerTransactionType.SUBSCRIPTION_ACTIVATION,
      },
      select: { type: true, metadata: true },
      take: 5000,
    });
    let settled = 0;
    for (const row of txRows) {
      const meta = row.metadata as
        | { debtSettled?: unknown }
        | null
        | undefined;
      if (row.type === LedgerTransactionType.SUBSCRIPTION_ACTIVATION) {
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
      totalSubscriptionUsage: (usageAgg._sum.totalPrice?.toNumber() ?? 0).toFixed(4),
      debtSettledBySubscriptions: settled.toFixed(4),
    };
  }
}

