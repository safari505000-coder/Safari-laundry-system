import { PrismaService } from '../prisma/prisma.service';
import { CreateLaundryPriceItemDto } from './dto/create-laundry-price-item.dto';
import { UpdateLaundryCategoryDto } from './dto/update-laundry-category.dto';
import { UpdateLaundryPriceItemDto } from './dto/update-laundry-price-item.dto';
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
    isActive: boolean;
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
    getCatalogVersion(): Promise<string>;
    updatePriceItem(id: string, dto: UpdateLaundryPriceItemDto): Promise<LaundryPriceListItemDto>;
    createPriceItem(dto: CreateLaundryPriceItemDto): Promise<LaundryPriceListItemDto>;
    deletePriceItem(id: string): Promise<{
        deletedId: string;
    }>;
    updateCategory(id: string, dto: UpdateLaundryCategoryDto): Promise<LaundryItemCategoryDto>;
    private mapItemDto;
}
