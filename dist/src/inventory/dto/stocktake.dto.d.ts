export declare class StocktakeLineDto {
    stockItemId: string;
    countedQuantity: number;
    note?: string;
}
export declare class StocktakeDto {
    branchId: string;
    reference?: string;
    note?: string;
    lines: StocktakeLineDto[];
}
