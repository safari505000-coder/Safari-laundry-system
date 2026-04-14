import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LedgerTransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerLedgerService } from '../customer-ledger/customer-ledger.service';
import { ActivateSubscriptionDto } from './dto/activate-subscription.dto';
import type { SettlementHistoryRowDto } from './dto/settlement-history-row.dto';

@Injectable()
export class CallCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerLedger: CustomerLedgerService,
  ) {}

  listActiveSubscriptionPlans() {
    return this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        price: true,
        creditAmount: true,
      },
    });
  }

  async searchCustomers(query: string) {
    const q = query.trim();
    if (q.length < 2) {
      throw new BadRequestException(
        'Search query must be at least 2 characters',
      );
    }
    return this.prisma.customer.findMany({
      where: {
        OR: [
          { phone: { contains: q, mode: 'insensitive' } },
          { phone2: { contains: q, mode: 'insensitive' } },
          { address: { contains: q, mode: 'insensitive' } },
          { displayName: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 50,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        phone: true,
        phone2: true,
        displayName: true,
        address: true,
        createdAt: true,
        wallet: {
          select: {
            balance: true,
            debt: true,
          },
        },
      },
    });
  }

  async activateSubscription(userId: string, dto: ActivateSubscriptionDto) {
    return this.prisma.$transaction(async (tx) => {
      const settlement = await this.customerLedger.activateSubscriptionPlan(tx, {
        customerId: dto.customerId,
        planId: dto.planId,
        performedByUserId: userId,
      });
      const [customer, plan, wallet] = await Promise.all([
        tx.customer.findUniqueOrThrow({
          where: { id: dto.customerId },
          select: {
            id: true,
            phone: true,
            phone2: true,
            address: true,
            displayName: true,
          },
        }),
        tx.subscriptionPlan.findUniqueOrThrow({
          where: { id: dto.planId },
        }),
        tx.customerWallet.findUniqueOrThrow({
          where: { customerId: dto.customerId },
        }),
      ]);
      return {
        customer,
        plan: {
          id: plan.id,
          name: plan.name,
          price: plan.price.toString(),
          creditAmount: plan.creditAmount.toString(),
        },
        wallet: {
          balance: wallet.balance.toString(),
          debt: wallet.debt.toString(),
        },
        settlement,
      };
    });
  }

  async listCustomerSettlementHistory(
    customerId: string,
    take = 40,
  ): Promise<SettlementHistoryRowDto[]> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const rows = await this.prisma.transactionHistory.findMany({
      where: {
        customerId,
        type: {
          in: [
            LedgerTransactionType.SUBSCRIPTION_ACTIVATION,
            LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        createdAt: true,
        type: true,
        balanceAfter: true,
        debtAfter: true,
        orderId: true,
        metadata: true,
      },
    });

    return rows.map((r) => {
      const meta =
        r.metadata && typeof r.metadata === 'object' && !Array.isArray(r.metadata)
          ? (r.metadata as Record<string, unknown>)
          : {};
      const str = (k: string): string | undefined => {
        const v = meta[k];
        return typeof v === 'string' ? v : undefined;
      };
      return {
        id: r.id,
        createdAt: r.createdAt,
        type: r.type,
        totalCollected: str('totalCollected'),
        debtSettled: str('debtSettled'),
        creditedToBalance: str('creditedToBalance'),
        balanceAfter: r.balanceAfter.toString(),
        debtAfter: r.debtAfter.toString(),
        planName: str('planName'),
        orderId: r.orderId ?? undefined,
      };
    });
  }
}
