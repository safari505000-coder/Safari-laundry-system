import { DebtHoldStatus } from "@prisma/client";
export declare class ListDebtHoldsDto {
    from?: string;
    to?: string;
    employeeUserId?: string;
    status?: DebtHoldStatus;
}
