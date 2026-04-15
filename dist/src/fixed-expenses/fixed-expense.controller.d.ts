import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { CreateFixedExpenseDto } from './dto/create-fixed-expense.dto';
import { FixedExpenseService } from './fixed-expense.service';
export declare class FixedExpenseController {
    private readonly fixedExpenseService;
    constructor(fixedExpenseService: FixedExpenseService);
    create(dto: CreateFixedExpenseDto, user: JwtUser): Promise<{
        id: string;
        branchId: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        category: import("@prisma/client").$Enums.FixedExpenseCategory;
        isActive: boolean;
        monthlyAmount: import("@prisma/client-runtime-utils").Decimal;
        effectiveFrom: Date;
        effectiveTo: Date | null;
    }>;
    list(branchId?: string): Promise<({
        branch: {
            id: string;
            name: string;
        };
    } & {
        id: string;
        branchId: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        category: import("@prisma/client").$Enums.FixedExpenseCategory;
        isActive: boolean;
        monthlyAmount: import("@prisma/client-runtime-utils").Decimal;
        effectiveFrom: Date;
        effectiveTo: Date | null;
    })[]>;
}
