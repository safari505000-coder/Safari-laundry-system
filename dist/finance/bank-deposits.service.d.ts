import { BankDepositType } from "@prisma/client";
import { GeneralLedgerService } from '../general-ledger/general-ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import type { BankDepositsListQueryDto } from './dto/bank-deposits-list-query.dto';
export declare class BankDepositsService {
    private readonly prisma;
    private readonly generalLedger;
    private readonly auditLogs;
    constructor(prisma: PrismaService, generalLedger: GeneralLedgerService, auditLogs: AuditLogsService);
    list(q: BankDepositsListQueryDto): Promise<{
        from: string;
        to: string;
        entries: {
            id: string;
            depositType: import(".prisma/client").$Enums.BankDepositType;
            status: import(".prisma/client").$Enums.BankDepositStatus;
            amountKd: string;
            receiptImageUrl: string;
            shiftId: string | null;
            createdAt: string;
            verifiedAt: string | null;
            uploadedBy: {
                id: string;
                username: string;
                fullName: string;
            };
            verifiedByAccountant: {
                id: string;
                username: string;
                fullName: string;
            } | null;
        }[];
    }>;
    createFromUpload(managerId: string, fileUrl: string, depositType: BankDepositType, amountKd: number, shiftId?: string | null, actorRole?: string | null): Promise<{
        id: string;
        depositType: import(".prisma/client").$Enums.BankDepositType;
        status: import(".prisma/client").$Enums.BankDepositStatus;
        amountKd: string;
        receiptImageUrl: string;
        shiftId: string | null;
        createdAt: string;
        verifiedAt: string | null;
        uploadedBy: {
            id: string;
            username: string;
            fullName: string;
        };
        verifiedByAccountant: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    }>;
    verify(accountantId: string, id: string): Promise<{
        id: string;
        depositType: import(".prisma/client").$Enums.BankDepositType;
        status: import(".prisma/client").$Enums.BankDepositStatus;
        amountKd: string;
        receiptImageUrl: string;
        shiftId: string | null;
        createdAt: string;
        verifiedAt: string | null;
        uploadedBy: {
            id: string;
            username: string;
            fullName: string;
        };
        verifiedByAccountant: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    }>;
    private mapOne;
}
