import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { CreateFixedExpenseDto } from './dto/create-fixed-expense.dto';
import { FixedExpenseService } from './fixed-expense.service';
export declare class FixedExpenseController {
    private readonly fixedExpenseService;
    constructor(fixedExpenseService: FixedExpenseService);
    create(dto: CreateFixedExpenseDto, user: JwtUser): Promise<{
        branchId: string;
        title: string;
        id: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        category: import(".prisma/client").$Enums.FixedExpenseCategory;
        monthlyAmount: import("@prisma/client-runtime-utils/dist").Decimal;
        effectiveFrom: Date;
        effectiveTo: Date | null;
    }>;
    list(branchId?: string): Promise<({
        branch: {
            name: string;
            id: string;
        };
    } & {
        branchId: string;
        title: string;
        id: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        category: import(".prisma/client").$Enums.FixedExpenseCategory;
        monthlyAmount: import("@prisma/client-runtime-utils/dist").Decimal;
        effectiveFrom: Date;
        effectiveTo: Date | null;
    })[]>;
}
