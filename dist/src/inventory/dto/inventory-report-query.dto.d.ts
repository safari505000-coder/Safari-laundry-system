export declare enum StockStatusFilter {
    IN_STOCK = "IN_STOCK",
    LOW_STOCK = "LOW_STOCK",
    OUT_OF_STOCK = "OUT_OF_STOCK"
}
export declare class InventoryReportQueryDto {
    categoryId?: string;
    branchId?: string;
    status?: StockStatusFilter;
}
