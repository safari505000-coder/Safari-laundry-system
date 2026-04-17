import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

function mergeTier(
  base: Prisma.Decimal | null,
  override: Prisma.Decimal | null | undefined,
): string | null {
  if (base == null) return null;
  if (override != null) return override.toFixed(4);
  return base.toFixed(4);
}

function mergeRequired(
  base: Prisma.Decimal,
  override: Prisma.Decimal | null | undefined,
): string {
  if (override != null) return override.toFixed(4);
  return base.toFixed(4);
}

type ItemWithCategory = Prisma.LaundryPriceListItemGetPayload<{
  include: { category: true };
}>;

@Injectable()
export class LaundryPriceListService {
  constructor(private readonly prisma: PrismaService) {}

  async findCategoriesForApi(): Promise<LaundryItemCategoryDto[]> {
    const rows = await this.prisma.laundryItemCategory.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      nameAr: r.nameAr,
      nameEn: r.nameEn,
      sortOrder: r.sortOrder,
    }));
  }

  /**
   * Single source of truth for catalog rows shown in POS and management UIs.
   * When `branchId` is set, optional `LaundryBranchItemPrice` rows override per tier (null = inherit base).
   */
  async findPriceListForBranch(
    branchId: string | null,
  ): Promise<LaundryPriceListItemDto[]> {
    const items = await this.prisma.laundryPriceListItem.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { category: true },
    });

    let overrides = new Map<
      string,
      {
        priceNormal: Prisma.Decimal | null;
        priceUrgent: Prisma.Decimal | null;
        pricePressOnly: Prisma.Decimal | null;
        priceUrgentPress: Prisma.Decimal | null;
      }
    >();
    if (branchId) {
      const br = await this.prisma.laundryBranchItemPrice.findMany({
        where: { branchId },
      });
      overrides = new Map(
        br.map((x) => [
          x.laundryPriceListItemId,
          {
            priceNormal: x.priceNormal,
            priceUrgent: x.priceUrgent,
            pricePressOnly: x.pricePressOnly,
            priceUrgentPress: x.priceUrgentPress,
          },
        ]),
      );
    }

    return items.map((row) => this.mapItemDto(row, overrides.get(row.id)));
  }

  /** Back-compat alias — base list with no branch merge. */
  async findAllForApi(): Promise<LaundryPriceListItemDto[]> {
    return this.findPriceListForBranch(null);
  }

  private mapItemDto(
    r: ItemWithCategory,
    ov?: {
      priceNormal: Prisma.Decimal | null;
      priceUrgent: Prisma.Decimal | null;
      pricePressOnly: Prisma.Decimal | null;
      priceUrgentPress: Prisma.Decimal | null;
    },
  ): LaundryPriceListItemDto {
    const c = r.category;
    return {
      id: r.id,
      code: r.code,
      nameAr: r.nameAr,
      nameEn: r.nameEn,
      sortOrder: r.sortOrder,
      manualEntry: r.manualEntry,
      priceNormal: mergeRequired(r.priceNormal, ov?.priceNormal),
      priceUrgent: mergeRequired(r.priceUrgent, ov?.priceUrgent),
      pricePressOnly: mergeTier(r.pricePressOnly, ov?.pricePressOnly),
      priceUrgentPress: mergeTier(r.priceUrgentPress, ov?.priceUrgentPress),
      categoryId: c?.id ?? null,
      categoryCode: c?.code ?? null,
      categoryNameAr: c?.nameAr ?? null,
      categoryNameEn: c?.nameEn ?? null,
      categorySortOrder: c?.sortOrder ?? null,
    };
  }
}
