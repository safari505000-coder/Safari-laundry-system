import { CustomerCollectionStatusKind } from "@prisma/client";
export declare class OutstandingRowDto {
    customerId: string;
    name?: string | null;
    phone: string;
    phone2?: string | null;
    driverId?: string | null;
    driverName?: string | null;
    totalDueKd: number;
    invoicesCount: number;
    lastOrderAt?: string | null;
    earliestDueDate?: string | null;
    daysLate: number;
    priorityScore: number;
    status: CustomerCollectionStatusKind;
    blocked: boolean;
    note?: string | null;
}
export declare class OutstandingResponseDto {
    rows: OutstandingRowDto[];
    totalCustomers: number;
    totalInvoices: number;
    totalDueKd: string;
    source: 'COLLECTIONS_ENGINE';
    blockedCount: number;
    lateCount: number;
    riskCount: number;
    generatedAt: string;
    fromIso: string;
    toIso: string;
}
