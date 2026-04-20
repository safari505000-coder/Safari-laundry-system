import { PosPaymentMethod, Prisma } from '@prisma/client';
import { GeneralLedgerService } from '../general-ledger/general-ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import type { SubscriptionActivationSettlement } from './subscription-settlement.types';
export type PrismaTx = Prisma.TransactionClient;
export type OrderWalletSettlementPrefetch = {
    customerId: string;
    totalPrice: Prisma.Decimal;
    posPaymentMethod: PosPaymentMethod | null;
    walletSettledAt: Date | null;
    skipPerformerLookup?: boolean;
};
export declare class CustomerLedgerService {
    private readonly prisma;
    private readonly generalLedger;
    constructor(prisma: PrismaService, generalLedger: GeneralLedgerService);
    private decimalFromMinor;
    getOrCreateWalletTx(tx: PrismaTx, customerId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        balance: Prisma.Decimal;
        customerId: string;
        debt: Prisma.Decimal;
        subscriptionActivatedAt: Date | null;
        subscriptionExpiresAt: Date | null;
        subscriptionPlanId: string | null;
        subscriptionPlanName: string | null;
        subscriptionReminderCount: number;
        subscriptionLastReminderAt: Date | null;
    }>;
    private resolveDebtCategory;
    private ensureCustomerOriginBranchTx;
    applyOrderWalletSettlementForCompletedOrder(tx: PrismaTx, orderId: string, performedByUserId: string, prefetch?: OrderWalletSettlementPrefetch, extraMetadata?: Record<string, Prisma.JsonValue>): Promise<void>;
    activateSubscriptionPlan(tx: PrismaTx, params: {
        customerId: string;
        planId: string;
        performedByUserId: string;
    }): Promise<SubscriptionActivationSettlement>;
    recordPartialDebtPayment(params: {
        customerId: string;
        amountKd: string;
        discountKd?: string;
        paymentMethod: PosPaymentMethod;
        performedByUserId: string;
        note?: string;
    }): Promise<{
        amountCollectedKd: string;
        discountAppliedKd: string;
        totalReducedKd: string;
        previousDebtKd: string;
        newDebtKd: string;
        walletBalanceKd: string;
        paymentMethod: PosPaymentMethod;
    }>;
}
