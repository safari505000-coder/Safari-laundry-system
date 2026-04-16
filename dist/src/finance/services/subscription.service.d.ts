import { PrismaService } from '../../prisma/prisma.service';
export declare class SubscriptionService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getUsageAndSettledDebtTotals(): Promise<{
        totalSubscriptionUsage: string;
        debtSettledBySubscriptions: string;
    }>;
}
