import { DebtTransferStatus } from "@prisma/client";
export declare class ListDebtTransfersDto {
    status?: DebtTransferStatus;
    sourceDriverId?: string;
    targetDriverId?: string;
    executedById?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
}
