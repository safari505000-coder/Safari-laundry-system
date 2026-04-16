import { DebtEntityCategory } from '@prisma/client';
export declare class DebtByCategoryQueryDto {
    from: string;
    to: string;
    category?: DebtEntityCategory;
    branchId?: string;
    actorUserId?: string;
}
