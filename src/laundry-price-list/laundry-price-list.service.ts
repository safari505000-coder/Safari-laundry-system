import { Injectable } from '@nestjs/common';
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

@Injectable()
export class LaundryPriceListService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForApi(): Promise<LaundryPriceListItemDto[]> {
    const rows = await this.prisma.laundryPriceListItem.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      nameAr: r.nameAr,
      nameEn: r.nameEn,
      sortOrder: r.sortOrder,
      manualEntry: r.manualEntry,
      priceNormal: r.priceNormal.toFixed(4),
      priceUrgent: r.priceUrgent.toFixed(4),
      pricePressOnly: r.pricePressOnly?.toFixed(4) ?? null,
      priceUrgentPress: r.priceUrgentPress?.toFixed(4) ?? null,
    }));
  }
}
