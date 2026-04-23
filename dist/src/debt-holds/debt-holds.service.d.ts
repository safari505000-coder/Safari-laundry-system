import { DebtHoldMode, Prisma, SafariRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { ListDebtHoldsDto } from './dto/list-debt-holds.dto';
export declare class DebtHoldsService {
    private readonly prisma;
    private readonly systemSettings;
    constructor(prisma: PrismaService, systemSettings: SystemSettingsService);
    private assertAdmin;
    computeOpenDebtForEmployee(employeeUserId: string): Promise<{
        debt: Prisma.Decimal;
        debtKd: string;
    }>;
    buildHoldSnapshotForPayroll(employeeUserId: string): Promise<{
        debtAmount: Prisma.Decimal;
        holdAmount: Prisma.Decimal;
        holdMode: DebtHoldMode;
    } | null>;
    persistHold(data: {
        employeeUserId: string;
        payrollId: string;
        debtAmount: Prisma.Decimal;
        holdAmount: Prisma.Decimal;
        holdMode: DebtHoldMode;
    }, tx?: Prisma.TransactionClient): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        note: string | null;
        status: import("@prisma/client").$Enums.DebtHoldStatus;
        payrollId: string | null;
        employeeUserId: string;
        debtAmount: Prisma.Decimal;
        holdAmount: Prisma.Decimal;
        releasedAmount: Prisma.Decimal;
        releaseDate: Date | null;
        disbursedAt: Date | null;
        disbursedById: string | null;
    }>;
    releaseSettledHolds(employeeUserId: string, tx?: Prisma.TransactionClient): Promise<{
        releaseKd: string;
        releasedIds: string[];
    }>;
    list(actorRole: SafariRole, actorUserId: string, dto: ListDebtHoldsDto): Promise<({
        payroll: {
            id: string;
            status: import("@prisma/client").$Enums.PayrollStatus;
            paymentDate: Date;
        } | null;
        employee: {
            id: string;
            username: string;
            fullName: string;
        };
        disbursedBy: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        note: string | null;
        status: import("@prisma/client").$Enums.DebtHoldStatus;
        payrollId: string | null;
        employeeUserId: string;
        debtAmount: Prisma.Decimal;
        holdAmount: Prisma.Decimal;
        releasedAmount: Prisma.Decimal;
        releaseDate: Date | null;
        disbursedAt: Date | null;
        disbursedById: string | null;
    })[]>;
    createManualHold(actorRole: SafariRole, dto: {
        employeeUserId: string;
        holdAmount: number;
        note?: string;
        payrollId?: string;
    }): Promise<{
        employee: {
            id: string;
            username: string;
            fullName: string;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        note: string | null;
        status: import("@prisma/client").$Enums.DebtHoldStatus;
        payrollId: string | null;
        employeeUserId: string;
        debtAmount: Prisma.Decimal;
        holdAmount: Prisma.Decimal;
        releasedAmount: Prisma.Decimal;
        releaseDate: Date | null;
        disbursedAt: Date | null;
        disbursedById: string | null;
    }>;
    releaseManualHold(actorRole: SafariRole, id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        note: string | null;
        status: import("@prisma/client").$Enums.DebtHoldStatus;
        payrollId: string | null;
        employeeUserId: string;
        debtAmount: Prisma.Decimal;
        holdAmount: Prisma.Decimal;
        releasedAmount: Prisma.Decimal;
        releaseDate: Date | null;
        disbursedAt: Date | null;
        disbursedById: string | null;
    }>;
    markDisbursed(actorRole: SafariRole, actorUserId: string, id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        note: string | null;
        status: import("@prisma/client").$Enums.DebtHoldStatus;
        payrollId: string | null;
        employeeUserId: string;
        debtAmount: Prisma.Decimal;
        holdAmount: Prisma.Decimal;
        releasedAmount: Prisma.Decimal;
        releaseDate: Date | null;
        disbursedAt: Date | null;
        disbursedById: string | null;
    }>;
    previewForEmployee(actorRole: SafariRole, employeeUserId: string): Promise<{
        isPolicyActive: boolean;
        debtKd: string;
        holdKd: string;
        holdMode: null;
    } | {
        isPolicyActive: boolean;
        debtKd: string;
        holdKd: string;
        holdMode: import("@prisma/client").$Enums.DebtHoldMode;
    }>;
}
