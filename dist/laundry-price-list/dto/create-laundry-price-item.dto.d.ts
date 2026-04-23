export declare class CreateLaundryPriceItemDto {
    code: string;
    nameAr: string;
    nameEn?: string | null;
    categoryId?: string | null;
    sortOrder?: number;
    manualEntry?: boolean;
    priceNormal?: number;
    priceUrgent?: number;
    pricePressOnly?: number | null;
    priceUrgentPress?: number | null;
}
