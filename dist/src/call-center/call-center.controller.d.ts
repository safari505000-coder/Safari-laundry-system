import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { CallCenterService } from './call-center.service';
import { ActivateSubscriptionDto } from './dto/activate-subscription.dto';
import { ExtendSubscriptionDto } from './dto/extend-subscription.dto';
import { DebtRecoveryQueryDto } from './dto/debt-recovery-report.dto';
import { MarkOrderPaidDto } from './dto/mark-order-paid.dto';
export declare class CallCenterController {
    private readonly callCenterService;
    constructor(callCenterService: CallCenterService);
    operationsSummary(branchId?: string): Promise<import("./dto/operations-summary.dto").CallCenterOperationsSummaryDto>;
    debtRecoveryReport(q: DebtRecoveryQueryDto): Promise<import("./dto/debt-recovery-report.dto").DebtRecoveryReportDto>;
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
        address: string | null;
        wallet: {
            balance: import("@prisma/client-runtime-utils").Decimal;
            debt: import("@prisma/client-runtime-utils").Decimal;
        } | null;
        phone2: string | null;
        displayName: string | null;
    }[]>;
    activateSubscription(dto: ActivateSubscriptionDto, user: JwtUser): Promise<{
        customer: {
            id: string;
            phone: string;
            address: string | null;
            phone2: string | null;
            displayName: string | null;
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
    extendSubscription(dto: ExtendSubscriptionDto, user: JwtUser): Promise<{
        customerId: string;
        extensionDays: number;
        previousExpiresAt: string;
        newExpiresAt: string;
        planId: string;
        planName: string | null;
    }>;
    markOrderReminderSent(orderId: string): Promise<import("./dto/reminder-result.dto").ReminderResultDto>;
    ensureOrderPaymentLink(orderId: string): Promise<{
        url: string;
    }>;
    markCollectionOrderPaid(orderId: string, dto: MarkOrderPaidDto, user: JwtUser): Promise<{
        orderId: string;
        alreadySettled: boolean;
        amountKd: string;
        posPaymentMethod: import("@prisma/client").PosPaymentMethod;
    }>;
    markSubscriberReminderSent(customerId: string): Promise<import("./dto/reminder-result.dto").ReminderResultDto>;
    listSettlements(customerId: string): Promise<import("./dto/settlement-history-row.dto").SettlementHistoryRowDto[]>;
}
