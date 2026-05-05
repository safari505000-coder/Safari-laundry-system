import { AuditStatus } from "@prisma/client";
import type { Request } from "express";
import { DiscordAlertService } from '../common/services/discord-alert.service';
import type { RequestWithId } from '../common/middleware/request-id.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityStateService } from './security-state.service';
import type { AuditLogsQueryDto } from './dto/audit-logs-query.dto';
import type { AuditLogTimelineResponseDto } from './dto/audit-logs-timeline.dto';
type AuditRequest = RequestWithId & Request & {
    user?: {
        userId?: string;
        sub?: string;
        role?: string;
    };
};
type AuditInput = {
    userId?: string | null;
    role?: string | null;
    action: string;
    resource: string;
    customerId?: string | null;
    orderId?: string | null;
    amount?: string | number | null;
    source?: string | null;
    endpoint?: string | null;
    method?: string | null;
    status: AuditStatus;
    ip?: string | null;
    userAgent?: string | null;
    requestId?: string | null;
    suspicious?: boolean;
    changes?: Record<string, unknown>;
};
export declare class AuditLogsService {
    private readonly prisma;
    private readonly discordAlerts;
    private readonly securityState;
    private readonly logger;
    constructor(prisma: PrismaService, discordAlerts: DiscordAlertService, securityState: SecurityStateService);
    log(input: AuditInput): void;
    logFinancialEvent(input: {
        action: 'ORDER_CREATED' | 'PAYMENT_MADE' | 'DEBT_PAYMENT' | 'CASH_HANDOVER_TRANSFER' | 'CASH_HANDOVER_REJECTED' | 'CASH_DEPOSIT_REGISTERED' | 'CASH_DEPOSIT_VERIFIED' | 'CASH_DEPOSIT_UNCOVERED' | 'DOUBLE_COUNT_DETECTED' | 'SUBSCRIPTION_SOURCE_ANOMALY' | 'OVERPAYMENT_DETECTED' | 'OVERRIDE_BLOCKED_CUSTOMER' | 'CUSTOMER_BLOCKED' | 'CUSTOMER_UNBLOCKED';
        customerId?: string | null;
        orderId?: string | null;
        amount?: string | number | null;
        source?: string | null;
        userId?: string | null;
        role?: string | null;
        changes?: Record<string, unknown>;
    }): void;
    logRequest(req: AuditRequest, statusCode: number): void;
    checkBlocked(req: AuditRequest): Promise<boolean>;
    checkSensitiveRateLimit(req: AuditRequest): Promise<boolean>;
    checkFailedAttemptBudget(req: AuditRequest): Promise<boolean>;
    auditDenied(req: AuditRequest, action: string, reason: string): void;
    private write;
    verifyAuditIntegrity(): Promise<{
        valid: boolean;
        checked: number;
        brokenAt?: string;
    }>;
    listTimeline(query: AuditLogsQueryDto): Promise<AuditLogTimelineResponseDto>;
    private auditHash;
    private recordForbidden;
    private applyTemporaryBlock;
    private alert;
    private shouldAuditRequest;
    private actionFor;
    private resourceFor;
    private isAuthEndpoint;
    private isSensitiveEndpoint;
    private endpoint;
    private userId;
    private ip;
    private userAgent;
    private actorKey;
    private blockKeys;
}
export {};
