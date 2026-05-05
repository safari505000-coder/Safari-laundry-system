import { InvoiceAuditAction } from "@prisma/client";
export declare class ListAuditLogQueryDto {
    from?: string;
    to?: string;
    action?: InvoiceAuditAction;
    actorId?: string;
    limit?: number;
    offset?: number;
}
