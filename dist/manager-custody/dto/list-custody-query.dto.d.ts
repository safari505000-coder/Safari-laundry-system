import { ManagerCashCustodyStatus } from '@prisma/client';
export declare class ListCustodyQueryDto {
    status?: ManagerCashCustodyStatus;
    managerId?: string;
    branchId?: string;
}
