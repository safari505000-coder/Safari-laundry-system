import { PrismaService } from '../prisma/prisma.service';
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
};
export declare class LaundryPriceListService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAllForApi(): Promise<LaundryPriceListItemDto[]>;
}
