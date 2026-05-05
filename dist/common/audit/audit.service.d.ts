export type LightweightAuditUser = {
    userId?: string | number | null;
    role?: string | null;
    branchId?: string | number | null;
    scope?: string | null;
};
export declare class AuditService {
    private readonly logger;
    logAudit(action: string, user: LightweightAuditUser | null | undefined, metadata?: Record<string, unknown>): void;
}
