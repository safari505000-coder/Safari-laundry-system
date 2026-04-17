import { DepositType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DepositsListQueryDto } from './dto/deposits-list-query.dto';
import { UpdateDepositStatusDto } from './dto/update-deposit-status.dto';
import { DebtService } from './services/debt.service';
export declare class DepositsService {
    private readonly prisma;
    private readonly debtService;
    constructor(prisma: PrismaService, debtService: DebtService);
    listForUser(userId: string, role: string, query: DepositsListQueryDto): Promise<{
        rows: {
            id: string;
            driverId: string;
            driverName: string;
            amount: string;
            type: import("@prisma/client").$Enums.DepositType;
            receiptImage: string;
            status: import("@prisma/client").$Enums.DepositStatus;
            auditComment: string | null;
            auditedBy: {
                id: string;
                username: string;
                fullName: string;
            } | null;
            createdAt: string;
            updatedAt: string;
        }[];
    }>;
    createByDriver(driverId: string, amount: number, type: DepositType, receiptImageUrl: string): Promise<{
        id: string;
        driverId: string;
        driverName: string;
        amount: string;
        type: import("@prisma/client").$Enums.DepositType;
        receiptImage: string;
        status: import("@prisma/client").$Enums.DepositStatus;
        auditComment: string | null;
        auditedBy: null;
        createdAt: string;
        updatedAt: string;
    }>;
    updateStatus(auditorId: string, id: string, dto: UpdateDepositStatusDto): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.DepositStatus;
        auditComment: string | null;
        updatedAt: string;
    }>;
}
