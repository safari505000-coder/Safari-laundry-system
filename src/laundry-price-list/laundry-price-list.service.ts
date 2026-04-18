import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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

  /**
   * Monotonically-increasing catalog version string.
   * Derived from the most-recent `updatedAt` across price items, categories, and
   * branch overrides so it survives server restarts and any backchannel DB edit.
   * Consumed by SafariStream snapshot so Driver POS can invalidate its cached
   * price list without a push channel (polled every 45s by the provider).
   */
  async getCatalogVersion(): Promise<string> {
    const [items, cats, overrides] = await Promise.all([
      this.prisma.laundryPriceListItem.aggregate({
        _max: { updatedAt: true },
      }),
      this.prisma.laundryItemCategory.aggregate({
        _max: { updatedAt: true },
      }),
      this.prisma.laundryBranchItemPrice.aggregate({
        _max: { updatedAt: true },
      }),
    ]);
    const candidates = [
      items._max.updatedAt,
      cats._max.updatedAt,
      overrides._max.updatedAt,
    ].filter((d): d is Date => d instanceof Date);
    if (candidates.length === 0) return '0';
    const newest = candidates.reduce((a, b) => (a > b ? a : b));
    return newest.toISOString();
  }

  async updatePriceItem(
    id: string,
    dto: UpdateLaundryPriceItemDto,
  ): Promise<LaundryPriceListItemDto> {
    const existing = await this.prisma.laundryPriceListItem.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Laundry price item not found');
    }

    if (dto.categoryId !== undefined && dto.categoryId !== null) {
      const cat = await this.prisma.laundryItemCategory.findUnique({
        where: { id: dto.categoryId },
        select: { id: true },
      });
      if (!cat) {
        throw new NotFoundException('Category not found');
      }
    }

    const data: Prisma.LaundryPriceListItemUpdateInput = {};
    if (dto.nameAr !== undefined) data.nameAr = dto.nameAr;
    if (dto.nameEn !== undefined) data.nameEn = dto.nameEn;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.manualEntry !== undefined) data.manualEntry = dto.manualEntry;
    if (dto.priceNormal !== undefined) {
      data.priceNormal = new Prisma.Decimal(dto.priceNormal);
    }
    if (dto.priceUrgent !== undefined) {
      data.priceUrgent = new Prisma.Decimal(dto.priceUrgent);
    }
    if (dto.pricePressOnly !== undefined) {
      data.pricePressOnly =
        dto.pricePressOnly === null
          ? null
          : new Prisma.Decimal(dto.pricePressOnly);
    }
    if (dto.priceUrgentPress !== undefined) {
      data.priceUrgentPress =
        dto.priceUrgentPress === null
          ? null
          : new Prisma.Decimal(dto.priceUrgentPress);
    }
    if (dto.categoryId !== undefined) {
      data.category =
        dto.categoryId === null
          ? { disconnect: true }
          : { connect: { id: dto.categoryId } };
    }

    const row = await this.prisma.laundryPriceListItem.update({
      where: { id },
      data,
      include: { category: true },
    });
    return this.mapItemDto(row);
  }

  async updateCategory(
    id: string,
    dto: UpdateLaundryCategoryDto,
  ): Promise<LaundryItemCategoryDto> {
    const existing = await this.prisma.laundryItemCategory.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Category not found');
    }
    const data: Prisma.LaundryItemCategoryUpdateInput = {};
    if (dto.nameAr !== undefined) data.nameAr = dto.nameAr;
    if (dto.nameEn !== undefined) data.nameEn = dto.nameEn;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    const row = await this.prisma.laundryItemCategory.update({
      where: { id },
      data,
    });
    return {
      id: row.id,
      code: row.code,
      nameAr: row.nameAr,
      nameEn: row.nameEn,
      sortOrder: row.sortOrder,
    };
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
