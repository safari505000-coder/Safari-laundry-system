import { PosPaymentMethod, Prisma } from '@prisma/client';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerLedgerService } from '../customer-ledger/customer-ledger.service';
import { PaymentsService } from '../common/services/payments.service';
import { CustomerNotificationsService } from '../customer-notifications/customer-notifications.service';
import { DebtService } from '../finance/services/debt.service';
import { OrdersService } from '../orders/orders.service';
import type { SendPaymentLinkWhatsappResultDto } from './dto/send-payment-link-whatsapp.dto';
import { ActivateSubscriptionDto } from './dto/activate-subscription.dto';
import { CancelSubscriptionDto } from './dto/cancel-subscription.dto';
import { ExtendSubscriptionDto } from './dto/extend-subscription.dto';
import type { SettlementHistoryRowDto } from './dto/settlement-history-row.dto';
import type { CallCenterOperationsSummaryDto } from './dto/operations-summary.dto';
import type { DebtRecoveryReportDto } from './dto/debt-recovery-report.dto';
import type { ReminderResultDto } from './dto/reminder-result.dto';
import type { SubscriptionRolloverPreviewDto } from './dto/subscription-rollover-preview.dto';
import type { CustomerSubscriptionRowDto } from './dto/customer-subscription.dto';
import type { RecordPartialDebtPaymentDto } from './dto/record-partial-debt-payment.dto';
import type { CustomerLedgerQueryDto, CustomerLedgerResponseDto } from './dto/customer-ledger.dto';
import type { DailyCollectionsQueryDto, DailyCollectionsResponseDto } from './dto/daily-collections.dto';
import type { DebtConversionOptionsResponseDto } from './dto/debt-conversion-options.dto';
import type { DailyCollectionsReconciliationQueryDto, DailyCollectionsReconciliationResponseDto } from './dto/daily-collections-reconciliation.dto';
export declare class CallCenterService {
    private readonly prisma;
    private readonly customerLedger;
    private readonly payments;
    private readonly jwt;
    private readonly orders;
    private readonly customerNotifications;
    private readonly debt;
    constructor(prisma: PrismaService, customerLedger: CustomerLedgerService, payments: PaymentsService, jwt: JwtService, orders: OrdersService, customerNotifications: CustomerNotificationsService, debt: DebtService);
    private assertOrderInCollectionScope;
    createStatementShareToken(customerId: string, params: {
        from?: string | null;
        to?: string | null;
        publicBaseUrl: string;
    }): Promise<{
        token: string;
        shareUrl: string;
        expiresAtIso: string;
    }>;
    getPublicStatement(token: string): Promise<CustomerLedgerResponseDto>;
    ensureOrderPaymentLink(orderId: string, actor: JwtUser): Promise<{
        url: string;
    }>;
    sendPaymentLinkToCustomerWhatsapp(orderId: string, actor: JwtUser): Promise<SendPaymentLinkWhatsappResultDto>;
    markCollectionOrderPaid(orderId: string, method: 'CASH' | 'KNET' | 'PAYMENT_LINK' | 'ONLINE', performedByUserId: string, actor: JwtUser): Promise<{
        orderId: string;
        alreadySettled: boolean;
        amountKd: string;
        posPaymentMethod: PosPaymentMethod;
    }>;
    listActiveSubscriptionPlans(): Prisma.PrismaPromise<{
        id: string;
        name: string;
        salePrice: Prisma.Decimal;
        actualBalance: Prisma.Decimal;
    }[]>;
    searchCustomers(query: string): Promise<{
        wallet: {
            balance: Prisma.Decimal;
            debt: Prisma.Decimal;
        } | null;
        id: string;
        createdAt: Date;
        phone: string;
        address: string | null;
        phone2: string | null;
        displayName: string | null;
    }[]>;
    activateSubscription(userId: string, dto: ActivateSubscriptionDto): Promise<{
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
        settlement: {
            prepaidAutoReconciledOrderIds: string[];
            newBalance: string;
            newDebt: string;
            totalCollected: string;
            debtSettled: string;
            creditedToBalance: string;
            previousBalance: string;
            previousDebt: string;
            subscriptionId: string;
            rolledOverFromSubscriptionId: string | null;
            carriedBalanceKd: string;
            closedInvoiceIds: string[];
        };
    }>;
    cancelActiveSubscription(userId: string, dto: CancelSubscriptionDto): Promise<import("../customer-ledger/subscription-settlement.types").SubscriptionCancellationSettlement>;
    extendSubscription(userId: string, dto: ExtendSubscriptionDto): Promise<{
        customerId: string;
        extensionDays: number;
        previousExpiresAt: string;
        newExpiresAt: string;
        planId: string;
        planName: string | null;
    }>;
    listCustomerSettlementHistory(customerId: string, take?: number): Promise<SettlementHistoryRowDto[]>;
    sendOrderReminder(orderId: string, actor: JwtUser): Promise<ReminderResultDto>;
    sendSubscriberReminder(customerId: string): Promise<ReminderResultDto>;
    getOperationsSummary(branchId?: string | null, actor?: JwtUser | null): Promise<CallCenterOperationsSummaryDto>;
    getDebtRecoveryReport(fromIso?: string, toIso?: string): Promise<DebtRecoveryReportDto>;
    previewSubscriptionRollover(customerId: string): Promise<SubscriptionRolloverPreviewDto>;
    listCustomerSubscriptionChain(customerId: string): Promise<CustomerSubscriptionRowDto[]>;
    recordPartialDebtPayment(customerId: string, dto: RecordPartialDebtPaymentDto, performedByUserId: string): Promise<{
        amountCollectedKd: string;
        discountAppliedKd: string;
        totalReducedKd: string;
        previousDebtKd: string;
        newDebtKd: string;
        walletBalanceKd: string;
        paymentMethod: PosPaymentMethod;
        transactionHistoryId: string;
    }>;
    getCustomerLedger(customerId: string, filters: CustomerLedgerQueryDto): Promise<CustomerLedgerResponseDto>;
    getDailyCollections(params: DailyCollectionsQueryDto): Promise<DailyCollectionsResponseDto>;
    getDailyCollectionsReconciliation(params: DailyCollectionsReconciliationQueryDto): Promise<DailyCollectionsReconciliationResponseDto>;
    getDebtConversionOptions(customerId: string, paymentMethodHint?: PosPaymentMethod): Promise<DebtConversionOptionsResponseDto>;
    private mapSubscriptionChainRows;
}
