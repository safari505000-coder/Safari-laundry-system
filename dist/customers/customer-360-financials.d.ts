import { CashStatus, DebtSource, OrderStatus, PosPaymentMethod } from "@prisma/client";
import { PrismaService } from '../prisma/prisma.service';
import type { Customer360FinancialsDto } from './customer-360.types';
type MoneyLike = number | string | {
    toString(): string;
} | null | undefined;
export type Customer360PaymentSource = 'CASH' | 'KNET' | 'ONLINE' | 'WALLET' | 'SUBSCRIPTION';
export type CustomerFinancialInput = {
    orders: Array<{
        id?: string;
        status: OrderStatus | string;
        amount?: MoneyLike;
        totalPrice?: MoneyLike;
        cashStatus?: CashStatus | string | null;
        posPaymentMethod?: PosPaymentMethod | string | null;
        paymentSource?: Customer360PaymentSource | string | null;
        subscriptionId?: string | null;
    }>;
    debtLedger: Array<{
        orderId?: string | null;
        source: DebtSource | string;
        amount: MoneyLike;
    }>;
    subscription?: {
        id?: string | null;
        value?: MoneyLike;
        planActualBalanceSnapshot?: MoneyLike;
    } | null;
};
export type CustomerFinancialEngineResult = {
    totalInvoicesKd: string;
    totalPaymentsKd: string;
    totalDueKd: string;
    consumedKd: string;
    subscriptionRemainingKd: string;
    subscription: {
        value: string;
        consumed: string;
        remaining: string;
    };
    overpaymentBalanceKd: string;
    anomalyFlags: CustomerFinancialAnomaly[];
};
export type CustomerFinancialAnomaly = {
    type: 'DOUBLE_COUNT_DETECTED' | 'SUBSCRIPTION_SOURCE_ANOMALY' | 'OVERPAYMENT_DETECTED';
    orderId?: string | null;
    amountKd?: string | null;
    source?: string | null;
};
export declare function computeCustomerFinancials(data: CustomerFinancialInput): CustomerFinancialEngineResult;
export declare function computeCustomer360FinancialCore(prisma: PrismaService, customerId: string): Promise<Customer360FinancialsDto>;
export {};
