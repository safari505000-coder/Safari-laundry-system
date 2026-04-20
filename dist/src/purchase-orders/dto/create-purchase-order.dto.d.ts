export declare class CreatePurchaseOrderLineDto {
    stockItemId: string;
    quantityOrdered: number;
    unitCost: number;
}
export declare class CreatePurchaseOrderDto {
    supplierId: string;
    branchId: string;
    lines: CreatePurchaseOrderLineDto[];
    expectedAt?: string;
    notes?: string;
}
