import { PrismaService } from '../prisma/prisma.service';
export type LaundryItemCategoryDto = {
    id: string;
    code: string;
    nameAr: string;
    nameEn: string | null;
    sortOrder: number;
};
export type LaundryPriceListItemDto = {
    id: string;
    code: string;
    nameAr: string;
    nameEn: string | null;
    sortOrder: number;
    manualEntry: boolean;
    priceNormal: string;
    priceUrgent: string;
    pricePressOnly: string | null;
    priceUrgentPress: string | null;
    categoryId: string | null;
    categoryCode: string | null;
    categoryNameAr: string | null;
    categoryNameEn: string | null;
    categorySortOrder: number | null;
};
export declare class LaundryPriceListService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findCategoriesForApi(): Promise<LaundryItemCategoryDto[]>;
    findPriceListForBranch(branchId: string | null): Promise<LaundryPriceListItemDto[]>;
    findAllForApi(): Promise<LaundryPriceListItemDto[]>;
    private mapItemDto;
}
