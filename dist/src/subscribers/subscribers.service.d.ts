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
    rowStatus: 'active_ok' | 'active_warn' | 'expired' | 'open_credit';
    invoiceAgeDays: number | null;
    reminderCount: number;
    lastReminderAtIso: string | null;
    canRemindNow: boolean;
};
export declare class SubscribersService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    list(): Promise<SubscriberListRow[]>;
}
