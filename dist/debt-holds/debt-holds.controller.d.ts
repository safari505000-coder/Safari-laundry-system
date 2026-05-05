import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { DebtHoldsService } from './debt-holds.service';
import { CreateManualHoldDto } from './dto/create-manual-hold.dto';
import { ListDebtHoldsDto } from './dto/list-debt-holds.dto';
export declare class DebtHoldsController {
    private readonly service;
    constructor(service: DebtHoldsService);
    list(q: ListDebtHoldsDto, user: JwtUser): Promise<({
        payroll: {
            status: import(".prisma/client").$Enums.PayrollStatus;
            id: string;
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
        status: import(".prisma/client").$Enums.DebtHoldStatus;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        note: string | null;
        payrollId: string | null;
        employeeUserId: string;
        debtAmount: import("@prisma/client-runtime-utils/dist").Decimal;
        holdAmount: import("@prisma/client-runtime-utils/dist").Decimal;
        releasedAmount: import("@prisma/client-runtime-utils/dist").Decimal;
        releaseDate: Date | null;
        disbursedAt: Date | null;
        disbursedById: string | null;
    })[]>;
    preview(employeeUserId: string, user: JwtUser): Promise<{
        isPolicyActive: boolean;
        debtKd: string;
        holdKd: string;
        holdMode: null;
    } | {
        isPolicyActive: boolean;
        debtKd: string;
        holdKd: string;
        holdMode: import(".prisma/client").$Enums.DebtHoldMode;
    }>;
    createManual(dto: CreateManualHoldDto, user: JwtUser): Promise<{
        employee: {
            id: string;
            username: string;
            fullName: string;
        };
    } & {
        status: import(".prisma/client").$Enums.DebtHoldStatus;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        note: string | null;
        payrollId: string | null;
        employeeUserId: string;
        debtAmount: import("@prisma/client-runtime-utils/dist").Decimal;
        holdAmount: import("@prisma/client-runtime-utils/dist").Decimal;
        releasedAmount: import("@prisma/client-runtime-utils/dist").Decimal;
        releaseDate: Date | null;
        disbursedAt: Date | null;
        disbursedById: string | null;
    }>;
    release(id: string, user: JwtUser): Promise<{
        status: import(".prisma/client").$Enums.DebtHoldStatus;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        note: string | null;
        payrollId: string | null;
        employeeUserId: string;
        debtAmount: import("@prisma/client-runtime-utils/dist").Decimal;
        holdAmount: import("@prisma/client-runtime-utils/dist").Decimal;
        releasedAmount: import("@prisma/client-runtime-utils/dist").Decimal;
        releaseDate: Date | null;
        disbursedAt: Date | null;
        disbursedById: string | null;
    }>;
    disburse(id: string, user: JwtUser): Promise<{
        status: import(".prisma/client").$Enums.DebtHoldStatus;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        note: string | null;
        payrollId: string | null;
        employeeUserId: string;
        debtAmount: import("@prisma/client-runtime-utils/dist").Decimal;
        holdAmount: import("@prisma/client-runtime-utils/dist").Decimal;
        releasedAmount: import("@prisma/client-runtime-utils/dist").Decimal;
        releaseDate: Date | null;
        disbursedAt: Date | null;
        disbursedById: string | null;
    }>;
}
