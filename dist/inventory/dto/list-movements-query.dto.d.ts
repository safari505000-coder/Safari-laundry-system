import { StockMovementType } from "@prisma/client";
export declare class ListMovementsQueryDto {
    branchId?: string;
    stockItemId?: string;
    type?: StockMovementType;
    from?: string;
    to?: string;
    limit?: number;
}
