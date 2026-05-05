import { PurchaseOrderStatus } from "@prisma/client";
export declare class ListPurchaseOrdersQueryDto {
    status?: PurchaseOrderStatus;
    supplierId?: string;
    branchId?: string;
    fromIso?: string;
    toIso?: string;
    limit?: number;
    offset?: number;
}
