import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DebtEntityCategory,
  DebtSource,
  GeneralLedgerEntryType,
  LedgerTransactionType,
  PosPaymentMethod,
  Prisma,
  SafariRole,
} from '@prisma/client';
import {
  minorToAmountString,
  toMinorFromFixed4,
} from '../finance/finance-money';
import { GeneralLedgerService } from '../general-ledger/general-ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import type { SubscriptionActivationSettlement } from './subscription-settlement.types';

export type PrismaTx = Prisma.TransactionClient;

/** When the caller already loaded order fields (e.g. POS checkout), skip extra reads inside the tx. */
export type OrderWalletSettlementPrefetch = {
  customerId: string;
  totalPrice: Prisma.Decimal;
  posPaymentMethod: PosPaymentMethod | null;
  walletSettledAt: Date | null;
  /** POS path: performer was validated before the transaction */
  skipPerformerLookup?: boolean;
};

@Injectable()
export class CustomerLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generalLedger: GeneralLedgerService,
  ) {}

  private decimalFromMinor(minor: bigint): Prisma.Decimal {
    return new Prisma.Decimal(minorToAmountString(minor));
  }

  async getOrCreateWalletTx(tx: PrismaTx, customerId: string) {
    return tx.customerWallet.upsert({
      where: { customerId },
      create: { customerId },
      update: {},
    });
  }

  private resolveDebtCategory(role: SafariRole): DebtEntityCategory {
    if (role === SafariRole.OWNER) return DebtEntityCategory.OWNER;
    if (role === SafariRole.DRIVER) return DebtEntityCategory.DRIVER;
    if (role === SafariRole.CALL_CENTER) return DebtEntityCategory.CALL_CENTER;
    return DebtEntityCategory.BRANCH;
  }

  /**
   * First transaction attribution: lock customer origin branch once.
   */
  private async ensureCustomerOriginBranchTx(
    tx: PrismaTx,
    customerId: string,
    branchId?: string | null,
  ): Promise<void> {
    if (!branchId) return;
    await tx.customer.updateMany({
      where: { id: customerId, originBranchId: null },
      data: { originBranchId: branchId },
    });
  }

  /**
   * Deduct wallet balance toward the order total; any uncovered amount adds to debt.
   * Idempotent via `order.walletSettledAt`.
   */
  async applyOrderWalletSettlementForCompletedOrder(
    tx: PrismaTx,
    orderId: string,
    performedByUserId: string,
    prefetch?: OrderWalletSettlementPrefetch,
    /**
     * V1.6.0 — extra fields merged into the ledger row's `metadata` JSON.
     * Used by the payment-gateway finalize path to tag rows as
     * `debtSettlementViaLink = true` with `debtSettled` + original method,
     * so the "Collected Today" KPI and Accountant reports can
     * distinguish these from ordinary POS sales.
     */
    extraMetadata?: Record<string, Prisma.JsonValue>,
  ): Promise<void> {
    const o: OrderWalletSettlementPrefetch | null =
      prefetch ??
      (await tx.order.findUnique({
        where: { id: orderId },
        select: {
          walletSettledAt: true,
          customerId: true,
          totalPrice: true,
          posPaymentMethod: true,
        },
      }));
    if (!o) {
      throw new NotFoundException('Order not found');
    }
    if (o.walletSettledAt) {
      return;
    }

    const actor = await tx.user.findUnique({
      where: { id: performedByUserId },
      select: { id: true, safariRole: true, branchId: true },
    });
    if (!actor) {
      throw new NotFoundException(
        'Performing user not found — cannot record wallet settlement',
      );
    }
    await this.ensureCustomerOriginBranchTx(tx, o.customerId, actor.branchId);

    const totalMinor = toMinorFromFixed4(o.totalPrice);
    if (totalMinor < 0n) {
      throw new BadRequestException('Order total cannot be negative');
    }

    const wallet = await this.getOrCreateWalletTx(tx, o.customerId);
    const balanceMinor = toMinorFromFixed4(wallet.balance);
    const debtMinor = toMinorFromFixed4(wallet.debt);

    const takeMinor = balanceMinor < totalMinor ? balanceMinor : totalMinor;
    const shortfallMinor = totalMinor - takeMinor;
    const beforeSubscriptionDebtMinor = balanceMinor < 0n ? -balanceMinor : 0n;
    const isSubscriptionWalletPayment =
      o.posPaymentMethod === PosPaymentMethod.SUBSCRIPTION_WALLET;
    const newBalanceMinor =
      isSubscriptionWalletPayment ? balanceMinor - totalMinor : balanceMinor - takeMinor;
    const externalCoversShortfall =
      o.posPaymentMethod === PosPaymentMethod.CASH ||
      o.posPaymentMethod === PosPaymentMethod.KNET ||
      o.posPaymentMethod === PosPaymentMethod.ONLINE ||
      o.posPaymentMethod === PosPaymentMethod.PAYMENT_LINK;
    const addInvoiceDebt =
      o.posPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT ||
      (!isSubscriptionWalletPayment && !externalCoversShortfall);
    const newDebtMinor =
      addInvoiceDebt && shortfallMinor > 0n ? debtMinor + shortfallMinor : debtMinor;
    const afterSubscriptionDebtMinor = newBalanceMinor < 0n ? -newBalanceMinor : 0n;
    const addedSubscriptionDebtMinor =
      afterSubscriptionDebtMinor > beforeSubscriptionDebtMinor
        ? afterSubscriptionDebtMinor - beforeSubscriptionDebtMinor
        : 0n;
    const addedInvoiceDebtMinor =
      addInvoiceDebt && shortfallMinor > 0n ? shortfallMinor : 0n;

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
          addedToDebt: minorToAmountString(addedInvoiceDebtMinor),
          addedSubscriptionDebt: minorToAmountString(addedSubscriptionDebtMinor),
          posPaymentMethod: o.posPaymentMethod ?? null,
          externalCoversShortfall:
            externalCoversShortfall && shortfallMinor > 0n ? true : false,
          reportingCategory: 'DAILY_SALES',
          // Caller-supplied fields (e.g. debt-settlement tagging from the
          // payment gateway) take precedence over the defaults above.
          ...(extraMetadata ?? {}),
        },
      },
    });

    const debtCategory = this.resolveDebtCategory(actor.safariRole);
    if (addedInvoiceDebtMinor > 0n) {
      await tx.debtLedgerEntry.create({
        data: {
          customerId: o.customerId,
          orderId,
          source: DebtSource.INVOICE_SHORTFALL,
          category: debtCategory,
          amount: this.decimalFromMinor(addedInvoiceDebtMinor),
          branchId: actor.branchId,
          actorUserId: actor.id,
          note: 'Invoice shortfall recorded as receivable',
        },
      });
      // Dastur §5 — mirror the debt change onto the unified GL so every
      // financial movement surfaces on one audit stream.
      await this.generalLedger.append(tx, {
        entryType: GeneralLedgerEntryType.DEBT_ADJUSTMENT,
        amount: this.decimalFromMinor(addedInvoiceDebtMinor),
        memo: 'Invoice shortfall recorded as receivable',
        customerId: o.customerId,
        orderId,
        actorUserId: actor.id,
        metadata: {
          source: DebtSource.INVOICE_SHORTFALL,
          category: debtCategory,
          branchId: actor.branchId,
        },
      });
    }
    if (addedSubscriptionDebtMinor > 0n) {
      await tx.debtLedgerEntry.create({
        data: {
          customerId: o.customerId,
          orderId,
          source: DebtSource.SUBSCRIPTION_OVERUSE,
          category: debtCategory,
          amount: this.decimalFromMinor(addedSubscriptionDebtMinor),
          branchId: actor.branchId,
          actorUserId: actor.id,
          note: 'Subscription balance allowed to go negative',
        },
      });
      await this.generalLedger.append(tx, {
        entryType: GeneralLedgerEntryType.DEBT_ADJUSTMENT,
        amount: this.decimalFromMinor(addedSubscriptionDebtMinor),
        memo: 'Subscription balance allowed to go negative',
        customerId: o.customerId,
        orderId,
        actorUserId: actor.id,
        metadata: {
          source: DebtSource.SUBSCRIPTION_OVERUSE,
          category: debtCategory,
          branchId: actor.branchId,
        },
      });
    }

    await tx.order.updateMany({
      where: { id: orderId, walletSettledAt: null },
      data: { walletSettledAt: new Date() },
    });
  }

  /**
   * Subscription / top-up: cash collected (`plan.salePrice`) retires customer debt first
   * (up to min(existing debt, salePrice)), then prepaid balance increases by
   * max(0, plan.actualBalance − debtRetired). Cannot be bypassed — all activations go through here.
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
      select: { id: true, originBranchId: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const wallet = await this.getOrCreateWalletTx(tx, params.customerId);
    const actor = await tx.user.findUnique({
      where: { id: params.performedByUserId },
      select: { id: true, branchId: true },
    });
    if (!actor) {
      throw new NotFoundException('Performing user not found');
    }
    await this.ensureCustomerOriginBranchTx(tx, params.customerId, actor.branchId);
    const refreshedCustomer = await tx.customer.findUnique({
      where: { id: params.customerId },
      select: { originBranchId: true },
    });
    const subsidyBranchId = refreshedCustomer?.originBranchId ?? actor.branchId ?? null;
    const balanceMinor = toMinorFromFixed4(wallet.balance);
    const debtMinor = toMinorFromFixed4(wallet.debt);
    const priceMinor = toMinorFromFixed4(plan.salePrice);
    const creditMinor = toMinorFromFixed4(plan.actualBalance);

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

    const activatedAt = new Date();
    const validityDays = plan.validityDays > 0 ? plan.validityDays : 30;
    const subscriptionExpiresAt = new Date(activatedAt.getTime());
    subscriptionExpiresAt.setUTCDate(
      subscriptionExpiresAt.getUTCDate() + validityDays,
    );

    await tx.customerWallet.update({
      where: { id: wallet.id },
      data: {
        balance: this.decimalFromMinor(newBalanceMinor),
        debt: this.decimalFromMinor(newDebtMinor),
        subscriptionActivatedAt: activatedAt,
        subscriptionExpiresAt,
        subscriptionPlanId: plan.id,
        subscriptionPlanName: plan.name,
      },
    });

    const totalCollectedStr = minorToAmountString(priceMinor);
    const debtSettledStr = minorToAmountString(debtPaidMinor);
    const creditedStr = minorToAmountString(balanceIncreaseMinor);
    const subsidyMinor = creditMinor > priceMinor ? creditMinor - priceMinor : 0n;
    const subsidyStr = minorToAmountString(subsidyMinor);

    await tx.transactionHistory.create({
      data: {
        type: LedgerTransactionType.SUBSCRIPTION_ACTIVATION,
        customerId: params.customerId,
        amount: plan.actualBalance,
        balanceBefore: wallet.balance,
        balanceAfter: this.decimalFromMinor(newBalanceMinor),
        debtBefore: wallet.debt,
        debtAfter: this.decimalFromMinor(newDebtMinor),
        performedById: params.performedByUserId,
        metadata: {
          planId: plan.id,
          planName: plan.name,
          salePrice: plan.salePrice.toString(),
          actualBalance: plan.actualBalance.toString(),
          totalCollected: totalCollectedStr,
          debtSettled: debtSettledStr,
          creditedToBalance: creditedStr,
          subsidy: subsidyStr,
          subsidyBranchId,
          automaticDebtSettlement: true,
        },
      },
    });

    // Dastur §5 — if this activation paid down existing debt, record the
    // reduction in the unified GL so collections/adjustments never hide.
    if (debtPaidMinor > 0n) {
      await this.generalLedger.append(tx, {
        entryType: GeneralLedgerEntryType.DEBT_ADJUSTMENT,
        amount: `-${debtSettledStr}`,
        memo: 'Subscription activation settled existing debt',
        customerId: params.customerId,
        actorUserId: params.performedByUserId,
        metadata: {
          event: 'DEBT_SETTLED',
          source: 'SUBSCRIPTION_ACTIVATION',
          planId: plan.id,
          planName: plan.name,
          subsidyBranchId,
        },
      });
    }

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
