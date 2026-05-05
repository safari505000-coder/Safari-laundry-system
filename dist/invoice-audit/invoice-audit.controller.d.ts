import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { InvoiceAuditService } from './invoice-audit.service';
import { EditInvoiceDto } from './dto/edit-invoice.dto';
import { VoidInvoiceDto } from './dto/void-invoice.dto';
import { ListAuditLogQueryDto } from './dto/list-audit-log.dto';
import { CcPerformanceQueryDto } from './dto/cc-performance.dto';
export declare class InvoiceAuditController {
    private readonly invoiceAudit;
    constructor(invoiceAudit: InvoiceAuditService);
    editInvoice(orderId: string, dto: EditInvoiceDto, user: JwtUser): Promise<{
        orderId: string;
        auditId: string;
        changedFields: string[];
        newTotal: string;
        newPaymentMethod: import(".prisma/client").$Enums.PosPaymentMethod;
    }>;
    voidInvoice(orderId: string, dto: VoidInvoiceDto, user: JwtUser): Promise<{
        orderId: string;
        auditId: string;
        reversedAmount: string;
        reason: string;
    }>;
    listAuditLog(query: ListAuditLogQueryDto): Promise<{
        rows: {
            id: string;
            orderId: string;
            action: import(".prisma/client").$Enums.InvoiceAuditAction;
            actor: {
                id: string;
                fullName: string;
                safariRole: import(".prisma/client").$Enums.SafariRole;
            };
            actorRoleAtTime: import(".prisma/client").$Enums.SafariRole;
            actorNameAtTime: string;
            reason: string | null;
            changedFields: string[];
            financialImpactKd: string;
            beforeSnapshot: import("@prisma/client/runtime/client").JsonValue;
            afterSnapshot: import("@prisma/client/runtime/client").JsonValue;
            kuwaitDay: string;
            createdAt: string;
            order: {
                id: string;
                serialNumber: string | null;
                invoiceNumber: string | null;
                totalPriceKd: string;
                status: import(".prisma/client").$Enums.OrderStatus;
                customer: {
                    id: string;
                    phone: string;
                    displayName: string | null;
                };
            };
        }[];
        total: number;
        limit: number;
        offset: number;
    }>;
    ccPerformance(query: CcPerformanceQueryDto): Promise<{
        from: string;
        to: string;
        agents: {
            agentId: string;
            agentName: string;
            role: import(".prisma/client").$Enums.SafariRole;
            collectedKd: string;
            debtSettledKd: string;
            activationsCount: number;
            customersServed: number;
        }[];
        totals: {
            collectedKd: string;
            debtSettledKd: string;
            activationsCount: number;
            customersServed: number;
        };
    }>;
}
