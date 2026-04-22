import type { Request } from 'express';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { CallCenterService } from './call-center.service';
import { ActivateSubscriptionDto } from './dto/activate-subscription.dto';
import { ExtendSubscriptionDto } from './dto/extend-subscription.dto';
import { DebtRecoveryQueryDto } from './dto/debt-recovery-report.dto';
import { MarkOrderPaidDto } from './dto/mark-order-paid.dto';
import { RecordPartialDebtPaymentDto } from './dto/record-partial-debt-payment.dto';
import { CustomerLedgerQueryDto } from './dto/customer-ledger.dto';
import { DailyCollectionsQueryDto } from './dto/daily-collections.dto';
import { DailyCollectionsReconciliationQueryDto } from './dto/daily-collections-reconciliation.dto';
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
        phone2: string | null;
        displayName: string | null;
        wallet: {
            balance: import("@prisma/client-runtime-utils").Decimal;
            debt: import("@prisma/client-runtime-utils").Decimal;
        } | null;
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
    previewSubscriptionRollover(customerId: string): Promise<import("./dto/subscription-rollover-preview.dto").SubscriptionRolloverPreviewDto>;
    recordPartialDebtPayment(customerId: string, dto: RecordPartialDebtPaymentDto, user: JwtUser): Promise<{
        amountCollectedKd: string;
        discountAppliedKd: string;
        totalReducedKd: string;
        previousDebtKd: string;
        newDebtKd: string;
        walletBalanceKd: string;
        paymentMethod: import("@prisma/client").PosPaymentMethod;
    }>;
    listCustomerSubscriptionChain(customerId: string): Promise<import("./dto/customer-subscription.dto").CustomerSubscriptionRowDto[]>;
    getCustomerLedger(customerId: string, q: CustomerLedgerQueryDto): Promise<import("./dto/customer-ledger.dto").CustomerLedgerResponseDto>;
    createStatementShareLink(customerId: string, q: CustomerLedgerQueryDto, req: Request): Promise<{
        token: string;
        shareUrl: string;
        expiresAtIso: string;
    }>;
    getDailyCollections(q: DailyCollectionsQueryDto): Promise<import("./dto/daily-collections.dto").DailyCollectionsResponseDto>;
    getDailyCollectionsReconciliation(q: DailyCollectionsReconciliationQueryDto): Promise<import("./dto/daily-collections-reconciliation.dto").DailyCollectionsReconciliationResponseDto>;
    getDebtConversionOptions(customerId: string): Promise<import("./dto/debt-conversion-options.dto").DebtConversionOptionsResponseDto>;
}
