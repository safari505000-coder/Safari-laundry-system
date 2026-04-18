import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerLedgerService } from '../customer-ledger/customer-ledger.service';
import { ActivateSubscriptionDto } from './dto/activate-subscription.dto';
import type { SettlementHistoryRowDto } from './dto/settlement-history-row.dto';
import type { CallCenterOperationsSummaryDto } from './dto/operations-summary.dto';
import type { DebtRecoveryReportDto } from './dto/debt-recovery-report.dto';
import type { ReminderResultDto } from './dto/reminder-result.dto';
export declare class CallCenterService {
    private readonly prisma;
    private readonly customerLedger;
    constructor(prisma: PrismaService, customerLedger: CustomerLedgerService);
    listActiveSubscriptionPlans(): Prisma.PrismaPromise<{
        id: string;
        name: string;
        salePrice: Prisma.Decimal;
        actualBalance: Prisma.Decimal;
    }[]>;
    searchCustomers(query: string): Promise<{
        id: string;
        createdAt: Date;
        phone: string;
        wallet: {
            balance: Prisma.Decimal;
            debt: Prisma.Decimal;
        } | null;
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
    sendOrderReminder(orderId: string): Promise<ReminderResultDto>;
    sendSubscriberReminder(customerId: string): Promise<ReminderResultDto>;
    getOperationsSummary(): Promise<CallCenterOperationsSummaryDto>;
    getDebtRecoveryReport(fromIso?: string, toIso?: string): Promise<DebtRecoveryReportDto>;
}
