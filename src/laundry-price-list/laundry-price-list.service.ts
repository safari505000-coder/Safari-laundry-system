import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
    const [items, cats, overrides, itemCount] = await Promise.all([
      this.prisma.laundryPriceListItem.aggregate({
        _max: { updatedAt: true },
      }),
      this.prisma.laundryItemCategory.aggregate({
        _max: { updatedAt: true },
      }),
      this.prisma.laundryBranchItemPrice.aggregate({
        _max: { updatedAt: true },
      }),
      this.prisma.laundryPriceListItem.count(),
    ]);
    const candidates = [
      items._max.updatedAt,
      cats._max.updatedAt,
      overrides._max.updatedAt,
    ].filter((d): d is Date => d instanceof Date);
    const stamp =
      candidates.length === 0
        ? '0'
        : candidates.reduce((a, b) => (a > b ? a : b)).toISOString();
    // Suffix the row count so pure deletes (which can only reduce the _max
    // updatedAt) still change the version string and propagate through
    // SafariStream to Driver / POS clients.
    return `${stamp}|${itemCount}`;
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
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
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

  /**
   * OWNER-only — create a new master tariff row.
   *
   * Prices default to 0 (so the row can be created first and priced later via
   * the PATCH endpoint). The unique `code` protects against accidental double
   * submission and keeps external references (print manifests, PDFs) stable.
   */
  async createPriceItem(
    dto: CreateLaundryPriceItemDto,
  ): Promise<LaundryPriceListItemDto> {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.laundryPriceListItem.findUnique({
      where: { code },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('An item with this code already exists.');
    }

    if (dto.categoryId) {
      const cat = await this.prisma.laundryItemCategory.findUnique({
        where: { id: dto.categoryId },
        select: { id: true },
      });
      if (!cat) {
        throw new NotFoundException('Category not found');
      }
    }

    const row = await this.prisma.laundryPriceListItem.create({
      data: {
        code,
        nameAr: dto.nameAr.trim(),
        nameEn: dto.nameEn?.trim() ?? null,
        sortOrder: dto.sortOrder ?? 0,
        manualEntry: dto.manualEntry ?? false,
        priceNormal: new Prisma.Decimal(dto.priceNormal ?? 0),
        priceUrgent: new Prisma.Decimal(dto.priceUrgent ?? 0),
        pricePressOnly:
          dto.pricePressOnly == null
            ? null
            : new Prisma.Decimal(dto.pricePressOnly),
        priceUrgentPress:
          dto.priceUrgentPress == null
            ? null
            : new Prisma.Decimal(dto.priceUrgentPress),
        categoryId: dto.categoryId ?? null,
      },
      include: { category: true },
    });
    return this.mapItemDto(row);
  }

  /**
   * OWNER-only — hard delete a master tariff row.
   *
   * Guarded against collateral damage: deletion is refused if any historical
   * `OrderLineItem.label` still references the item's Arabic or English name.
   * The UI should surface this error and offer "Hide instead" (isActive=false),
   * which preserves historical integrity without widening the catalog.
   */
  async deletePriceItem(id: string): Promise<{ deletedId: string }> {
    const existing = await this.prisma.laundryPriceListItem.findUnique({
      where: { id },
      select: { id: true, nameAr: true, nameEn: true },
    });
    if (!existing) {
      throw new NotFoundException('Laundry price item not found');
    }

    const labels = [existing.nameAr, existing.nameEn].filter(
      (l): l is string => typeof l === 'string' && l.length > 0,
    );
    if (labels.length > 0) {
      const historyHit = await this.prisma.orderLineItem.count({
        where: { label: { in: labels } },
      });
      if (historyHit > 0) {
        throw new BadRequestException(
          'Cannot delete: existing orders reference this item. Hide it instead (deactivate).',
        );
      }
    }

    await this.prisma.laundryPriceListItem.delete({ where: { id } });
    return { deletedId: id };
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
      isActive: r.isActive,
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
