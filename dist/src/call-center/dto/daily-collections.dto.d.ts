import { PosPaymentMethod, SafariRole } from '@prisma/client';
export declare class DailyCollectionsQueryDto {
    date?: string;
    agentId?: string;
}
export declare class DailyCollectionEventDto {
    id: string;
    atIso: string;
    customerId: string;
    customerName: string | null;
    customerPhone: string | null;
    orderId: string | null;
    orderSerial: string | null;
    amountCollectedKd: string;
    discountAppliedKd: string;
    paymentMethod: PosPaymentMethod | null;
    kind: 'PARTIAL_DEBT_PAYMENT' | 'FULL_ORDER_SETTLEMENT';
    performedByUserId: string | null;
    performedByName: string | null;
    performedByRole: SafariRole | null;
    branchName: string | null;
    driverName: string | null;
    note: string | null;
    customerDebtAfterKd: string;
}
export declare class DailyCollectionsAgentTotalsDto {
    agentId: string | null;
    agentName: string | null;
    agentRole: SafariRole | null;
    eventCount: number;
    uniqueCustomers: number;
    collectedKd: string;
    discountKd: string;
}
export declare class DailyCollectionsResponseDto {
    dayIsoLocal: string;
    dayStartIso: string;
    dayEndIso: string;
    totals: {
        eventCount: number;
        uniqueCustomers: number;
        collectedKd: string;
        discountKd: string;
    };
    byAgent: DailyCollectionsAgentTotalsDto[];
    events: DailyCollectionEventDto[];
}
