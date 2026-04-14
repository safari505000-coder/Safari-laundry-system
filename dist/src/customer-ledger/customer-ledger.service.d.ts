import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { SubscriptionActivationSettlement } from './subscription-settlement.types';
export type PrismaTx = Prisma.TransactionClient;
export declare class CustomerLedgerService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private decimalFromMinor;
    getOrCreateWalletTx(tx: PrismaTx, customerId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        balance: Prisma.Decimal;
        debt: Prisma.Decimal;
        customerId: string;
    }>;
    applyOrderWalletSettlementForCompletedOrder(tx: PrismaTx, orderId: string, performedByUserId: string): Promise<void>;
    activateSubscriptionPlan(tx: PrismaTx, params: {
        customerId: string;
        planId: string;
        performedByUserId: string;
    }): Promise<SubscriptionActivationSettlement>;
}
