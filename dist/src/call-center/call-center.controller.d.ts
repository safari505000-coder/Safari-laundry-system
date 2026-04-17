import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { CallCenterService } from './call-center.service';
import { ActivateSubscriptionDto } from './dto/activate-subscription.dto';
export declare class CallCenterController {
    private readonly callCenterService;
    constructor(callCenterService: CallCenterService);
    listPlans(): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        name: string;
        salePrice: import("@prisma/client-runtime-utils").Decimal;
        actualBalance: import("@prisma/client-runtime-utils").Decimal;
    }[]>;
    searchCustomers(q: string): Promise<{
        id: string;
        createdAt: Date;
        phone: string;
        wallet: {
            balance: import("@prisma/client-runtime-utils").Decimal;
            debt: import("@prisma/client-runtime-utils").Decimal;
        } | null;
        phone2: string | null;
        displayName: string | null;
        address: string | null;
    }[]>;
    activateSubscription(dto: ActivateSubscriptionDto, user: JwtUser): Promise<{
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
    listSettlements(customerId: string): Promise<import("./dto/settlement-history-row.dto").SettlementHistoryRowDto[]>;
}
