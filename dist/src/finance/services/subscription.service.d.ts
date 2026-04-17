import { PrismaService } from '../../prisma/prisma.service';
export declare class SubscriptionService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getUsageAndSettledDebtTotals(): Promise<{
        totalSubscriptionUsage: string;
        debtSettledBySubscriptions: string;
    }>;
    getCustomerSubscriptionSnapshot(customerId: string): Promise<{
        walletBalance: string;
        subscriptionPlanId: string | null;
        subscriptionPlanName: string | null;
        subscriptionActivatedAt: string | null;
        subscriptionExpiresAt: string | null;
        totalSubscriptionUsage: string;
        debtSettledBySubscriptions: string;
    }>;
}
