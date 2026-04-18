import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryCategoryDto } from './dto/create-inventory-category.dto';
import { CreateStockItemDto } from './dto/create-stock-item.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import {
  InventoryReportQueryDto,
  StockStatusFilter,
} from './dto/inventory-report-query.dto';
import { StockInDto } from './dto/stock-in.dto';

export type InventoryStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export type InventoryReportRow = {
  id: string;
  stockItemId: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  unit: string;
  categoryId: string | null;
  categoryNameAr: string | null;
  categoryNameEn: string | null;
  branchId: string;
  branchName: string;
  /** KD-formatted strings; UI does its own locale formatting. */
  quantityOnHand: string;
  reorderPointEffective: string;
  avgUnitCost: string | null;
  lastUnitCost: string | null;
  lastMovementAt: string | null;
  status: InventoryStatus;
};

export type InventoryReportResponse = {
  rows: InventoryReportRow[];
  summary: {
    totalSkus: number;
    inStock: number;
    lowStock: number;
    outOfStock: number;
    inventoryValueKd: string;
  };
};

export type SupplierRow = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
};

export type StockItemRow = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  unit: string;
  categoryId: string | null;
  categoryNameAr: string | null;
  reorderPointDefault: string;
  lastUnitCost: string | null;
  isActive: boolean;
};

export type InventoryCategoryRow = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  sortOrder: number;
};

function deriveStatus(
  qty: Prisma.Decimal,
  reorder: Prisma.Decimal,
): InventoryStatus {
  if (qty.lessThanOrEqualTo(0)) return 'OUT_OF_STOCK';
  if (qty.lessThanOrEqualTo(reorder)) return 'LOW_STOCK';
  return 'IN_STOCK';
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Suppliers ──────────────────────────────────────────────────────────────

  async listSuppliers(): Promise<SupplierRow[]> {
    const rows = await this.prisma.supplier.findMany({
      orderBy: { name: 'asc' },
    });
    return rows.map((s) => ({
      id: s.id,
      name: s.name,
      phone: s.phone,
      address: s.address,
      isActive: s.isActive,
      createdAt: s.createdAt.toISOString(),
    }));
  }

  async createSupplier(dto: CreateSupplierDto): Promise<SupplierRow> {
    const row = await this.prisma.supplier.create({
      data: {
        name: dto.name.trim(),
        phone: dto.phone?.trim() || null,
        address: dto.address?.trim() || null,
        isActive: dto.isActive ?? true,
      },
    });
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      address: row.address,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ── Categories ─────────────────────────────────────────────────────────────

  async listCategories(): Promise<InventoryCategoryRow[]> {
    const rows = await this.prisma.inventoryCategory.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((c) => ({
      id: c.id,
      code: c.code,
      nameAr: c.nameAr,
      nameEn: c.nameEn,
      sortOrder: c.sortOrder,
    }));
  }

  async createCategory(
    dto: CreateInventoryCategoryDto,
  ): Promise<InventoryCategoryRow> {
    const row = await this.prisma.inventoryCategory.create({
      data: {
        code: dto.code.trim(),
        nameAr: dto.nameAr.trim(),
        nameEn: dto.nameEn?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    return {
      id: row.id,
      code: row.code,
      nameAr: row.nameAr,
      nameEn: row.nameEn,
      sortOrder: row.sortOrder,
    };
  }

  // ── Items ──────────────────────────────────────────────────────────────────

  async listItems(): Promise<StockItemRow[]> {
    const rows = await this.prisma.stockItem.findMany({
      orderBy: { code: 'asc' },
      include: { category: true },
    });
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      nameAr: r.nameAr,
      nameEn: r.nameEn,
      unit: r.unit,
      categoryId: r.categoryId,
      categoryNameAr: r.category?.nameAr ?? null,
      reorderPointDefault: r.reorderPointDefault.toFixed(4),
      lastUnitCost: r.lastUnitCost?.toFixed(4) ?? null,
      isActive: r.isActive,
    }));
  }

  async createItem(dto: CreateStockItemDto): Promise<StockItemRow> {
    if (dto.categoryId) {
      const cat = await this.prisma.inventoryCategory.findUnique({
        where: { id: dto.categoryId },
        select: { id: true },
      });
      if (!cat) throw new NotFoundException('Category not found');
    }
    const row = await this.prisma.stockItem.create({
      data: {
        code: dto.code.trim(),
        nameAr: dto.nameAr.trim(),
        nameEn: dto.nameEn?.trim() || null,
        unit: dto.unit?.trim() || 'pcs',
        categoryId: dto.categoryId ?? null,
        reorderPointDefault: new Prisma.Decimal(dto.reorderPointDefault ?? 0),
        isActive: dto.isActive ?? true,
      },
      include: { category: true },
    });
    return {
      id: row.id,
      code: row.code,
      nameAr: row.nameAr,
      nameEn: row.nameEn,
      unit: row.unit,
      categoryId: row.categoryId,
      categoryNameAr: row.category?.nameAr ?? null,
      reorderPointDefault: row.reorderPointDefault.toFixed(4),
      lastUnitCost: row.lastUnitCost?.toFixed(4) ?? null,
      isActive: row.isActive,
    };
  }

  // ── Smart inventory report ─────────────────────────────────────────────────
  /**
   * Multi-layer filter (Category / Branch / Stock-Status) over all
   * `BranchStockLevel` rows joined to their `StockItem` and `Branch`. Summary
   * counts the four Dastur stock colours plus total inventory value in KD.
   */
  async report(
    q: InventoryReportQueryDto,
  ): Promise<InventoryReportResponse> {
    const where: Prisma.BranchStockLevelWhereInput = {};
    if (q.branchId) where.branchId = q.branchId;
    if (q.categoryId) where.stockItem = { categoryId: q.categoryId };

    const levels = await this.prisma.branchStockLevel.findMany({
      where,
      include: {
        stockItem: { include: { category: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: [
        { branch: { name: 'asc' } },
        { stockItem: { code: 'asc' } },
      ],
    });

    const mapped: InventoryReportRow[] = levels.map((l) => {
      const reorder =
        l.reorderPoint ?? l.stockItem.reorderPointDefault;
      const status = deriveStatus(l.quantityOnHand, reorder);
      return {
        id: l.id,
        stockItemId: l.stockItemId,
        code: l.stockItem.code,
        nameAr: l.stockItem.nameAr,
        nameEn: l.stockItem.nameEn,
        unit: l.stockItem.unit,
        categoryId: l.stockItem.categoryId,
        categoryNameAr: l.stockItem.category?.nameAr ?? null,
        categoryNameEn: l.stockItem.category?.nameEn ?? null,
        branchId: l.branchId,
        branchName: l.branch.name,
        quantityOnHand: l.quantityOnHand.toFixed(4),
        reorderPointEffective: reorder.toFixed(4),
        avgUnitCost: l.avgUnitCost?.toFixed(4) ?? null,
        lastUnitCost: l.stockItem.lastUnitCost?.toFixed(4) ?? null,
        lastMovementAt: l.lastMovementAt?.toISOString() ?? null,
        status,
      };
    });

    const filtered =
      q.status === undefined
        ? mapped
        : mapped.filter((r) => r.status === q.status);

    let totalValue = new Prisma.Decimal(0);
    let inStock = 0;
    let lowStock = 0;
    let outOfStock = 0;
    for (const r of filtered) {
      if (r.status === 'IN_STOCK') inStock++;
      else if (r.status === 'LOW_STOCK') lowStock++;
      else outOfStock++;
      const unitCost = r.avgUnitCost ?? r.lastUnitCost;
      if (unitCost) {
        totalValue = totalValue.add(
          new Prisma.Decimal(r.quantityOnHand).mul(new Prisma.Decimal(unitCost)),
        );
      }
    }

    return {
      rows: filtered,
      summary: {
        totalSkus: filtered.length,
        inStock,
        lowStock,
        outOfStock,
        inventoryValueKd: totalValue.toFixed(4),
      },
    };
  }

  // ── Stock-In ───────────────────────────────────────────────────────────────
  /**
   * Records a STOCK_IN movement atomically with the branch level update.
   * Recomputes the weighted moving-average unit cost:
   *   avgUnitCost' = (avg * qtyOnHand + unitCost * qtyReceived) / (qtyOnHand + qtyReceived)
   */
  async stockIn(dto: StockInDto, userId: string) {
    const item = await this.prisma.stockItem.findUnique({
      where: { id: dto.stockItemId },
    });
    if (!item || !item.isActive) {
      throw new NotFoundException('Stock item not found or inactive');
    }
    const branch = await this.prisma.branch.findUnique({
      where: { id: dto.branchId },
      select: { id: true },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    if (!dto.supplierId && !dto.supplierName?.trim()) {
      throw new BadRequestException(
        'Supplier required: supply either supplierId or supplierName.',
      );
    }

    const receivedQty = new Prisma.Decimal(dto.quantity);
    const unitCost = new Prisma.Decimal(dto.unitCost);
    const totalCost = receivedQty.mul(unitCost);

    return this.prisma.$transaction(async (tx) => {
      // Resolve / auto-create supplier
      let supplierId = dto.supplierId ?? null;
      if (!supplierId && dto.supplierName) {
        const created = await tx.supplier.create({
          data: { name: dto.supplierName.trim() },
        });
        supplierId = created.id;
      }

      // Upsert the branch level row and recompute moving-average cost
      const existing = await tx.branchStockLevel.findUnique({
        where: {
          branchId_stockItemId: {
            branchId: dto.branchId,
            stockItemId: dto.stockItemId,
          },
        },
      });

      let newQty: Prisma.Decimal;
      let newAvg: Prisma.Decimal;
      if (existing) {
        const prevQty = existing.quantityOnHand;
        const prevAvg = existing.avgUnitCost ?? new Prisma.Decimal(0);
        newQty = prevQty.add(receivedQty);
        const weightedPrev = prevAvg.mul(prevQty);
        const weightedIn = unitCost.mul(receivedQty);
        newAvg =
          newQty.isZero() ? unitCost : weightedPrev.add(weightedIn).div(newQty);
        await tx.branchStockLevel.update({
          where: { id: existing.id },
          data: {
            quantityOnHand: newQty,
            avgUnitCost: newAvg,
            lastMovementAt: new Date(),
          },
        });
      } else {
        newQty = receivedQty;
        newAvg = unitCost;
        await tx.branchStockLevel.create({
          data: {
            branchId: dto.branchId,
            stockItemId: dto.stockItemId,
            quantityOnHand: newQty,
            avgUnitCost: newAvg,
            lastMovementAt: new Date(),
          },
        });
      }

      await tx.stockItem.update({
        where: { id: dto.stockItemId },
        data: { lastUnitCost: unitCost },
      });

      const movement = await tx.stockMovement.create({
        data: {
          stockItemId: dto.stockItemId,
          branchId: dto.branchId,
          type: StockMovementType.STOCK_IN,
          quantity: receivedQty,
          unitCost,
          totalCost,
          supplierId,
          recordedById: userId,
          reference: dto.reference?.trim() || null,
          note: dto.note?.trim() || null,
          receiptUrl: dto.receiptUrl ?? null,
        },
      });

      return {
        id: movement.id,
        stockItemId: movement.stockItemId,
        branchId: movement.branchId,
        quantity: movement.quantity.toFixed(4),
        unitCost: movement.unitCost?.toFixed(4) ?? null,
        totalCost: movement.totalCost?.toFixed(4) ?? null,
        supplierId: movement.supplierId,
        reference: movement.reference,
        newQuantityOnHand: newQty.toFixed(4),
        newAvgUnitCost: newAvg.toFixed(4),
        createdAt: movement.createdAt.toISOString(),
      };
    });
  }

  // ── Movements (audit) ──────────────────────────────────────────────────────

  async listRecentMovements(limit = 50, branchId?: string) {
    const rows = await this.prisma.stockMovement.findMany({
      where: branchId ? { branchId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      include: {
        stockItem: { select: { code: true, nameAr: true, nameEn: true, unit: true } },
        branch: { select: { name: true } },
        supplier: { select: { name: true } },
        recordedBy: { select: { fullName: true, username: true } },
      },
    });
    return rows.map((m) => ({
      id: m.id,
      type: m.type,
      stockItem: m.stockItem,
      branchName: m.branch.name,
      supplierName: m.supplier?.name ?? null,
      recordedBy: m.recordedBy,
      quantity: m.quantity.toFixed(4),
      unitCost: m.unitCost?.toFixed(4) ?? null,
      totalCost: m.totalCost?.toFixed(4) ?? null,
      reference: m.reference,
      note: m.note,
      receiptUrl: m.receiptUrl,
      createdAt: m.createdAt.toISOString(),
    }));
  }
}
