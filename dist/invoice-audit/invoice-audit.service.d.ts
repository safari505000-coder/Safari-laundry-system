import { Prisma, SafariRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GeneralLedgerService } from '../general-ledger/general-ledger.service';
import { EditInvoiceDto } from './dto/edit-invoice.dto';
import { ListAuditLogQueryDto } from './dto/list-audit-log.dto';
import { CcPerformanceQueryDto } from './dto/cc-performance.dto';
export declare class InvoiceAuditService {
    private readonly prisma;
    private readonly generalLedger;
    constructor(prisma: PrismaService, generalLedger: GeneralLedgerService);
    private decimalToFilsBigInt;
    private buildSnapshot;
    private diffSnapshots;
    private reverseWalletForOrder;
    private applyWalletForOrder;
    editInvoice(orderId: string, actorId: string, actorRole: SafariRole, dto: EditInvoiceDto): Promise<{
        orderId: string;
        auditId: string;
        changedFields: string[];
        newTotal: string;
        newPaymentMethod: import("@prisma/client").$Enums.PosPaymentMethod | null;
    }>;
    voidInvoice(orderId: string, actorId: string, actorRole: SafariRole, reason: string): Promise<{
        orderId: string;
        auditId: string;
        reversedAmount: string;
        reason: string;
    }>;
    listAuditLog(query: ListAuditLogQueryDto): Promise<{
        rows: {
            id: string;
            orderId: string;
            action: import("@prisma/client").$Enums.InvoiceAuditAction;
            actor: {
                id: string;
                fullName: string;
                safariRole: import("@prisma/client").$Enums.SafariRole;
            };
            actorRoleAtTime: import("@prisma/client").$Enums.SafariRole;
            actorNameAtTime: string;
            reason: string | null;
            changedFields: string[];
            financialImpactKd: string;
            beforeSnapshot: Prisma.JsonValue;
            afterSnapshot: Prisma.JsonValue;
            kuwaitDay: string;
            createdAt: string;
            order: {
                id: string;
                serialNumber: string | null;
                invoiceNumber: string | null;
                totalPriceKd: string;
                status: import("@prisma/client").$Enums.OrderStatus;
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
    getCcPerformance(q: CcPerformanceQueryDto): Promise<{
        from: string;
        to: string;
        agents: {
            agentId: string;
            agentName: string;
            role: import("@prisma/client").$Enums.SafariRole;
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
