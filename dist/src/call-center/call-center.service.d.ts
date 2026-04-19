import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerLedgerService } from '../customer-ledger/customer-ledger.service';
import { PaymentsService } from '../common/services/payments.service';
import { ActivateSubscriptionDto } from './dto/activate-subscription.dto';
import { ExtendSubscriptionDto } from './dto/extend-subscription.dto';
import type { SettlementHistoryRowDto } from './dto/settlement-history-row.dto';
import type { CallCenterOperationsSummaryDto } from './dto/operations-summary.dto';
import type { DebtRecoveryReportDto } from './dto/debt-recovery-report.dto';
import type { ReminderResultDto } from './dto/reminder-result.dto';
export declare class CallCenterService {
    private readonly prisma;
    private readonly customerLedger;
    private readonly payments;
    constructor(prisma: PrismaService, customerLedger: CustomerLedgerService, payments: PaymentsService);
    ensureOrderPaymentLink(orderId: string): Promise<{
        url: string;
    }>;
    markCollectionOrderPaid(orderId: string, method: 'CASH' | 'KNET' | 'PAYMENT_LINK' | 'ONLINE', performedByUserId: string): Promise<{
        orderId: string;
        alreadySettled: boolean;
        amountKd: string;
        posPaymentMethod: import("@prisma/client").PosPaymentMethod;
    }>;
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
    extendSubscription(userId: string, dto: ExtendSubscriptionDto): Promise<{
        customerId: string;
        extensionDays: number;
        previousExpiresAt: string;
        newExpiresAt: string;
        planId: string;
        planName: string | null;
    }>;
    listCustomerSettlementHistory(customerId: string, take?: number): Promise<SettlementHistoryRowDto[]>;
    sendOrderReminder(orderId: string): Promise<ReminderResultDto>;
    sendSubscriberReminder(customerId: string): Promise<ReminderResultDto>;
    getOperationsSummary(branchId?: string | null): Promise<CallCenterOperationsSummaryDto>;
    getDebtRecoveryReport(fromIso?: string, toIso?: string): Promise<DebtRecoveryReportDto>;
}
