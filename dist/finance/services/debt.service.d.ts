import { DebtEntityCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionService } from './subscription.service';
import type { UnpaidInvoicesQueryDto, UnpaidInvoicesResponseDto } from '../dto/unpaid-invoices.dto';
import type { OpenDebtByIssuerResponseDto } from '../dto/open-debt-by-issuer.dto';
export declare class DebtService {
    private readonly prisma;
    private readonly subscriptionService;
    constructor(prisma: PrismaService, subscriptionService: SubscriptionService);
    getOwnerCustomerWalletSummary(): Promise<{
        totalWalletLiabilities: string;
        totalCustomerDebts: string;
        debtFromIssuedInvoices: string;
        debtFromSubscriptionOveruse: string;
        debtSettledBySubscriptions: string;
        debtByBranch: string;
        debtByDriver: string;
        debtByOwner: string;
        debtByCallCenter: string;
        totalSubscriptionUsage: string;
    }>;
    getDebtBreakdownByCategory(fromIso: string, toIso: string, category?: DebtEntityCategory, branchId?: string, actorUserId?: string): Promise<{
        from: string;
        to: string;
        rows: {
            category: import("@prisma/client").$Enums.DebtEntityCategory;
            source: import("@prisma/client").$Enums.DebtSource;
            entryCount: number;
            totalDebt: string;
        }[];
    }>;
    getTotalDebt(): Promise<string>;
    getCustomerDebtSnapshot(customerId: string): Promise<{
        walletDebt: string;
        subscriptionOveruseDebt: string;
        totalDebt: string;
    }>;
    applyDriverDepositSettlement(driverId: string, approvedAmountKd: number): Promise<{
        settledAmountKd: string;
        settledOrderCount: number;
    }>;
    getUnpaidInvoices(query: UnpaidInvoicesQueryDto): Promise<UnpaidInvoicesResponseDto>;
    getLedgerOpenDebtByCategory(whereExtra?: Prisma.DebtLedgerEntryWhereInput): Promise<{
        outstandingInvoiceDebtKd: string;
        outstandingSubscriptionDebtKd: string;
    }>;
    getOpenDebtByIssuer(branchId?: string): Promise<OpenDebtByIssuerResponseDto>;
}
