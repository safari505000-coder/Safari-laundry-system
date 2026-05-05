import type { Request } from "express";
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { PrismaService } from '../../prisma/prisma.service';
export type CustomerBlockSnapshot = {
    id: string;
    isBlocked: boolean;
    blockReason: string | null;
    blockedAt: Date | null;
};
export declare class CustomerBlockingService {
    private readonly prisma;
    private readonly auditLogs;
    constructor(prisma: PrismaService, auditLogs: AuditLogsService);
    findCustomerForRequest(req: Request): Promise<CustomerBlockSnapshot | null>;
    canOverrideBlockedCustomer(role: string | null | undefined): boolean;
    hasOverrideHeader(req: Request): boolean;
    logBlockedOverride(req: Request, customer: Pick<CustomerBlockSnapshot, 'id' | 'blockReason'>): Promise<void>;
    autoBlockIfNeeded(customerId: string): Promise<CustomerBlockSnapshot | null>;
    applyAutoBlockFromFinancials(customerId: string, totalDueKd: string): Promise<CustomerBlockSnapshot | null>;
    manualBlock(input: {
        customerId: string;
        reason: string;
        actorUserId: string | null;
        actorRole: string | null;
    }): Promise<CustomerBlockSnapshot>;
    manualUnblock(input: {
        customerId: string;
        reason: string | null;
        actorUserId: string | null;
        actorRole: string | null;
    }): Promise<CustomerBlockSnapshot>;
    private computeTotalDueKd;
}
