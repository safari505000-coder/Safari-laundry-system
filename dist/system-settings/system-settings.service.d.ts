import { Prisma, SafariRole, SystemToggleKey } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateDebtHoldPolicyDto } from './dto/update-debt-hold-policy.dto';
export declare class SystemSettingsService {
    private readonly prisma;
    private static readonly POLICY_ID;
    constructor(prisma: PrismaService);
    private assertOwnerOrGM;
    listToggles(actorRole: SafariRole): Promise<{
        key: "COMMISSION" | "DEBT_HOLD" | "PAYROLL" | "LOANS" | "ATTENDANCE";
        isEnabled: boolean;
        updatedAt: Date | null;
        updatedBy: string | null;
    }[]>;
    setToggle(actorRole: SafariRole, actorUserId: string, key: SystemToggleKey, isEnabled: boolean): Promise<{
        updatedAt: Date;
        key: import("@prisma/client").$Enums.SystemToggleKey;
        isEnabled: boolean;
        updatedBy: string | null;
    }>;
    isEnabled(key: SystemToggleKey): Promise<boolean>;
    getDebtHoldPolicy(): Promise<{
        id: string;
        updatedAt: Date;
        isActive: boolean;
        holdMode: import("@prisma/client").$Enums.DebtHoldMode;
        fixedAmount: Prisma.Decimal | null;
    }>;
    updateDebtHoldPolicy(actorRole: SafariRole, dto: UpdateDebtHoldPolicyDto): Promise<{
        id: string;
        updatedAt: Date;
        isActive: boolean;
        holdMode: import("@prisma/client").$Enums.DebtHoldMode;
        fixedAmount: Prisma.Decimal | null;
    }>;
    getPayrollSettings(): Promise<{
        id: string;
        updatedAt: Date;
        payDayOfMonth: number;
        autoDeductLoans: boolean;
        linkWithAttendance: boolean;
    }>;
    updatePayrollSettings(actorRole: SafariRole, dto: {
        payDayOfMonth: number;
        autoDeductLoans: boolean;
        linkWithAttendance: boolean;
    }): Promise<{
        id: string;
        updatedAt: Date;
        payDayOfMonth: number;
        autoDeductLoans: boolean;
        linkWithAttendance: boolean;
    }>;
}
