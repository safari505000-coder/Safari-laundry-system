import { OrdersService } from '../orders/orders.service';
import type { DebtKdBreakdownTrace } from '../orders/debt-kd-breakdown.util';
import { PrismaService } from '../prisma/prisma.service';
export type SubscriberListRow = {
    customerId: string;
    customerName: string;
    customerPhone: string | null;
    subscriptionType: string;
    planId: string | null;
    startDate: string | null;
    expiryDate: string | null;
    remainingDays: number | null;
    balance: string;
    balanceDisplayKd: string;
    debt: string;
    unsettledUnpaidKd: string;
    effectiveDebtKd: string;
    rowStatus: 'active_ok' | 'active_warn' | 'expired' | 'open_credit';
    invoiceAgeDays: number | null;
    reminderCount: number;
    lastReminderAtIso: string | null;
    canRemindNow: boolean;
    collectionPaymentLinkReminderTotal: number;
    collectionPendingHostedLinkAgeDays: number | null;
    debtKdBreakdownTrace?: DebtKdBreakdownTrace;
};
export declare class SubscribersService {
    private readonly prisma;
    private readonly orders;
    constructor(prisma: PrismaService, orders: OrdersService);
    list(q?: string): Promise<SubscriberListRow[]>;
}
