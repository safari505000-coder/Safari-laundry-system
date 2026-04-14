import { PrismaService } from '../prisma/prisma.service';
import { CustomerLedgerService } from '../customer-ledger/customer-ledger.service';
import { ActivateSubscriptionDto } from './dto/activate-subscription.dto';
import type { SettlementHistoryRowDto } from './dto/settlement-history-row.dto';
export declare class CallCenterService {
    private readonly prisma;
    private readonly customerLedger;
    constructor(prisma: PrismaService, customerLedger: CustomerLedgerService);
    listActiveSubscriptionPlans(): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        name: string;
        price: import("@prisma/client-runtime-utils").Decimal;
        creditAmount: import("@prisma/client-runtime-utils").Decimal;
    }[]>;
    searchCustomers(query: string): Promise<{
        id: string;
        createdAt: Date;
        wallet: {
            balance: import("@prisma/client-runtime-utils").Decimal;
            debt: import("@prisma/client-runtime-utils").Decimal;
        } | null;
        phone: string;
        phone2: string | null;
        displayName: string | null;
        address: string | null;
    }[]>;
    activateSubscription(userId: string, dto: ActivateSubscriptionDto): Promise<{
        customer: {
            id: string;
            phone: string;
            phone2: string | null;
            displayName: string | null;
            address: string | null;
        };
        plan: {
            id: string;
            name: string;
            price: string;
            creditAmount: string;
        };
        wallet: {
            balance: string;
            debt: string;
        };
        settlement: import("../customer-ledger/subscription-settlement.types").SubscriptionActivationSettlement;
    }>;
    listCustomerSettlementHistory(customerId: string, take?: number): Promise<SettlementHistoryRowDto[]>;
}
