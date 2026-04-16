import { BankDepositType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { BankDepositsListQueryDto } from './dto/bank-deposits-list-query.dto';
export declare class BankDepositsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    list(q: BankDepositsListQueryDto): Promise<{
        from: string;
        to: string;
        entries: {
            id: string;
            depositType: import("@prisma/client").$Enums.BankDepositType;
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
    createFromUpload(managerId: string, fileUrl: string, depositType: BankDepositType, amountKd: number, shiftId?: string | null): Promise<{
        id: string;
        depositType: import("@prisma/client").$Enums.BankDepositType;
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
        depositType: import("@prisma/client").$Enums.BankDepositType;
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
