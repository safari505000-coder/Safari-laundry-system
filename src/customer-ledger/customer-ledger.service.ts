import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LedgerTransactionType, Prisma } from '@prisma/client';
import {
  minorToAmountString,
  toMinorFromFixed4,
} from '../finance/finance-money';
import { PrismaService } from '../prisma/prisma.service';
import type { SubscriptionActivationSettlement } from './subscription-settlement.types';

export type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class CustomerLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  private decimalFromMinor(minor: bigint): Prisma.Decimal {
    return new Prisma.Decimal(minorToAmountString(minor));
  }

  async getOrCreateWalletTx(tx: PrismaTx, customerId: string) {
    let w = await tx.customerWallet.findUnique({ where: { customerId } });
    if (!w) {
      w = await tx.customerWallet.create({
        data: { customerId },
      });
    }
    return w;
  }

  /**
   * Deduct wallet balance toward the order total; any uncovered amount adds to debt.
   * Idempotent via `order.walletSettledAt`.
   */
  async applyOrderWalletSettlementForCompletedOrder(
    tx: PrismaTx,
    orderId: string,
    performedByUserId: string,
  ): Promise<void> {
    const o = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        walletSettledAt: true,
        customerId: true,
        totalPrice: true,
      },
    });
    if (!o) {
      throw new NotFoundException('Order not found');
    }
    if (o.walletSettledAt) {
      return;
    }

    const totalMinor = toMinorFromFixed4(o.totalPrice);
    if (totalMinor < 0n) {
      throw new BadRequestException('Order total cannot be negative');
    }

    const wallet = await this.getOrCreateWalletTx(tx, o.customerId);
    const balanceMinor = toMinorFromFixed4(wallet.balance);
    const debtMinor = toMinorFromFixed4(wallet.debt);

    const takeMinor = balanceMinor < totalMinor ? balanceMinor : totalMinor;
    const shortfallMinor = totalMinor - takeMinor;
    const newBalanceMinor = balanceMinor - takeMinor;
    const newDebtMinor = debtMinor + shortfallMinor;

    await tx.customerWallet.update({
      where: { id: wallet.id },
      data: {
        balance: this.decimalFromMinor(newBalanceMinor),
        debt: this.decimalFromMinor(newDebtMinor),
      },
    });

    await tx.transactionHistory.create({
      data: {
        type: LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
        customerId: o.customerId,
        orderId,
        amount: o.totalPrice,
        balanceBefore: wallet.balance,
        balanceAfter: this.decimalFromMinor(newBalanceMinor),
        debtBefore: wallet.debt,
        debtAfter: this.decimalFromMinor(newDebtMinor),
        performedById: performedByUserId,
        metadata: {
          appliedFromWallet: minorToAmountString(takeMinor),
          orderTotal: o.totalPrice.toString(),
          addedToDebt: minorToAmountString(shortfallMinor),
        },
      },
    });

    await tx.order.update({
      where: { id: orderId },
      data: { walletSettledAt: new Date() },
    });
  }

  /**
   * Subscription / top-up: cash collected (`plan.price`) retires customer debt first
   * (up to min(existing debt, price)), then prepaid balance increases by
   * max(0, plan.creditAmount − debtRetired). Cannot be bypassed — all activations go through here.
   */
  async activateSubscriptionPlan(
    tx: PrismaTx,
    params: {
      customerId: string;
      planId: string;
      performedByUserId: string;
    },
  ): Promise<SubscriptionActivationSettlement> {
    const plan = await tx.subscriptionPlan.findUnique({
      where: { id: params.planId },
    });
    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }
    if (!plan.isActive) {
      throw new BadRequestException('This subscription plan is not active');
    }
    const customer = await tx.customer.findUnique({
      where: { id: params.customerId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const wallet = await this.getOrCreateWalletTx(tx, params.customerId);
    const balanceMinor = toMinorFromFixed4(wallet.balance);
    const debtMinor = toMinorFromFixed4(wallet.debt);
    const priceMinor = toMinorFromFixed4(plan.price);
    const creditMinor = toMinorFromFixed4(plan.creditAmount);

    if (priceMinor < 0n || creditMinor < 0n) {
      throw new BadRequestException('Plan price and credit amount must be non-negative');
    }

    const debtPaidMinor =
      debtMinor < priceMinor ? debtMinor : priceMinor;
    const newDebtMinor = debtMinor - debtPaidMinor;
    const rawCreditMinor = creditMinor - debtPaidMinor;
    const balanceIncreaseMinor =
      rawCreditMinor > 0n ? rawCreditMinor : 0n;
    const newBalanceMinor = balanceMinor + balanceIncreaseMinor;

    await tx.customerWallet.update({
      where: { id: wallet.id },
      data: {
        balance: this.decimalFromMinor(newBalanceMinor),
        debt: this.decimalFromMinor(newDebtMinor),
      },
    });

    const totalCollectedStr = minorToAmountString(priceMinor);
    const debtSettledStr = minorToAmountString(debtPaidMinor);
    const creditedStr = minorToAmountString(balanceIncreaseMinor);

    await tx.transactionHistory.create({
      data: {
        type: LedgerTransactionType.SUBSCRIPTION_ACTIVATION,
        customerId: params.customerId,
        amount: plan.creditAmount,
        balanceBefore: wallet.balance,
        balanceAfter: this.decimalFromMinor(newBalanceMinor),
        debtBefore: wallet.debt,
        debtAfter: this.decimalFromMinor(newDebtMinor),
        performedById: params.performedByUserId,
        metadata: {
          planId: plan.id,
          planName: plan.name,
          planPrice: plan.price.toString(),
          creditAmount: plan.creditAmount.toString(),
          totalCollected: totalCollectedStr,
          debtSettled: debtSettledStr,
          creditedToBalance: creditedStr,
          automaticDebtSettlement: true,
        },
      },
    });

    return {
      totalCollected: totalCollectedStr,
      debtSettled: debtSettledStr,
      creditedToBalance: creditedStr,
      previousBalance: wallet.balance.toString(),
      previousDebt: wallet.debt.toString(),
      newBalance: minorToAmountString(newBalanceMinor),
      newDebt: minorToAmountString(newDebtMinor),
    };
  }
}
