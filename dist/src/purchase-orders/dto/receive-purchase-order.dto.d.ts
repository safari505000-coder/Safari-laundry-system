export declare class ReceivePurchaseOrderLineDto {
    purchaseOrderLineId: string;
    quantityReceived: number;
    unitCost?: number;
}
export declare class ReceivePurchaseOrderDto {
    lines: ReceivePurchaseOrderLineDto[];
    note?: string;
}
