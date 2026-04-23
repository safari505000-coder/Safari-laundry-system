import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { UpdateDebtHoldPolicyDto } from './dto/update-debt-hold-policy.dto';
import { UpdatePayrollSettingsDto } from './dto/update-payroll-settings.dto';
import { UpdateToggleDto } from './dto/update-toggle.dto';
import { SystemSettingsService } from './system-settings.service';
export declare class SystemSettingsController {
    private readonly service;
    constructor(service: SystemSettingsService);
    listToggles(user: JwtUser): Promise<{
        key: "COMMISSION" | "DEBT_HOLD" | "PAYROLL" | "LOANS" | "ATTENDANCE";
        isEnabled: boolean;
        updatedAt: Date | null;
        updatedBy: string | null;
    }[]>;
    setToggle(dto: UpdateToggleDto, user: JwtUser): Promise<{
        updatedAt: Date;
        key: import("@prisma/client").$Enums.SystemToggleKey;
        isEnabled: boolean;
        updatedBy: string | null;
    }>;
    getPolicy(): Promise<{
        id: string;
        updatedAt: Date;
        isActive: boolean;
        holdMode: import("@prisma/client").$Enums.DebtHoldMode;
        fixedAmount: import("@prisma/client-runtime-utils").Decimal | null;
    }>;
    updatePolicy(dto: UpdateDebtHoldPolicyDto, user: JwtUser): Promise<{
        id: string;
        updatedAt: Date;
        isActive: boolean;
        holdMode: import("@prisma/client").$Enums.DebtHoldMode;
        fixedAmount: import("@prisma/client-runtime-utils").Decimal | null;
    }>;
    getPayrollSettings(): Promise<{
        id: string;
        updatedAt: Date;
        payDayOfMonth: number;
        autoDeductLoans: boolean;
        linkWithAttendance: boolean;
    }>;
    updatePayrollSettings(dto: UpdatePayrollSettingsDto, user: JwtUser): Promise<{
        id: string;
        updatedAt: Date;
        payDayOfMonth: number;
        autoDeductLoans: boolean;
        linkWithAttendance: boolean;
    }>;
}
