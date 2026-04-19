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
import { InventoryReportQueryDto } from './dto/inventory-report-query.dto';
import { ListMovementsQueryDto } from './dto/list-movements-query.dto';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import { StockInDto } from './dto/stock-in.dto';
import { StockOutDto } from './dto/stock-out.dto';
import { StockTransferDto } from './dto/stock-transfer.dto';
import { StocktakeDto } from './dto/stocktake.dto';

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

  // ── Stock-Out (consumption) ────────────────────────────────────────────────
  /**
   * Records field consumption of an item at a branch. The branch level is
   * decremented; no cost layer is touched (avgUnitCost is a purchase-side
   * metric). Rejects attempts to go below zero because it would silently
   * mask an upstream data error — a stocktake is the correct tool for that.
   */
  async stockOut(dto: StockOutDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const { level, item } = await this.ensureItemAndLevel(
        tx,
        dto.stockItemId,
        dto.branchId,
      );
      const qty = new Prisma.Decimal(dto.quantity);
      if (level.quantityOnHand.lessThan(qty)) {
        throw new BadRequestException(
          `Insufficient stock at branch. Available: ${level.quantityOnHand.toFixed(4)}, requested: ${qty.toFixed(4)}.`,
        );
      }
      const newQty = level.quantityOnHand.sub(qty);
      const unitCost = level.avgUnitCost ?? item.lastUnitCost ?? null;
      const totalCost = unitCost ? qty.mul(unitCost) : null;

      await tx.branchStockLevel.update({
        where: { id: level.id },
        data: { quantityOnHand: newQty, lastMovementAt: new Date() },
      });

      const movement = await tx.stockMovement.create({
        data: {
          stockItemId: dto.stockItemId,
          branchId: dto.branchId,
          type: StockMovementType.STOCK_OUT,
          // Stored as negative so reporting SUMs are arithmetic-friendly.
          quantity: qty.neg(),
          unitCost,
          totalCost: totalCost ? totalCost.neg() : null,
          recordedById: userId,
          reference: dto.reference?.trim() || null,
          note: dto.note?.trim() || null,
        },
      });
      return this.serializeMovementResult(movement, newQty);
    });
  }

  // ── Adjustment ─────────────────────────────────────────────────────────────
  /**
   * Signed delta. Negative = write-off (breakage, expiry, shrinkage),
   * positive = found / recount increase. Reason is mandatory — surfaced in
   * the movements audit screen.
   */
  async adjust(dto: StockAdjustmentDto, userId: string) {
    if (dto.delta === 0) {
      throw new BadRequestException('delta must not be zero.');
    }
    return this.prisma.$transaction(async (tx) => {
      const { level, item } = await this.ensureItemAndLevel(
        tx,
        dto.stockItemId,
        dto.branchId,
      );
      const delta = new Prisma.Decimal(dto.delta);
      const newQty = level.quantityOnHand.add(delta);
      if (newQty.isNegative()) {
        throw new BadRequestException(
          `Adjustment would take stock below zero (current: ${level.quantityOnHand.toFixed(4)}).`,
        );
      }
      const unitCost = level.avgUnitCost ?? item.lastUnitCost ?? null;
      const totalCost = unitCost ? delta.mul(unitCost) : null;

      await tx.branchStockLevel.update({
        where: { id: level.id },
        data: { quantityOnHand: newQty, lastMovementAt: new Date() },
      });

      const movement = await tx.stockMovement.create({
        data: {
          stockItemId: dto.stockItemId,
          branchId: dto.branchId,
          type: StockMovementType.ADJUSTMENT,
          quantity: delta,
          unitCost,
          totalCost,
          recordedById: userId,
          reference: dto.reference?.trim() || null,
          note: dto.reason.trim(),
        },
      });
      return this.serializeMovementResult(movement, newQty);
    });
  }

  // ── Transfer between branches ──────────────────────────────────────────────
  /**
   * Atomic two-leg transfer. The source branch loses `quantity` and emits a
   * `TRANSFER_OUT`; the destination branch gains the same quantity and emits
   * a `TRANSFER_IN`. The destination's `avgUnitCost` is recomputed as a
   * weighted average of its previous balance and the transferred cost, so
   * inventory value is conserved across the system.
   */
  async transfer(dto: StockTransferDto, userId: string) {
    if (dto.fromBranchId === dto.toBranchId) {
      throw new BadRequestException('fromBranchId and toBranchId must differ.');
    }
    return this.prisma.$transaction(async (tx) => {
      const { level: fromLevel, item } = await this.ensureItemAndLevel(
        tx,
        dto.stockItemId,
        dto.fromBranchId,
      );
      const qty = new Prisma.Decimal(dto.quantity);
      if (fromLevel.quantityOnHand.lessThan(qty)) {
        throw new BadRequestException(
          `Insufficient stock at source branch. Available: ${fromLevel.quantityOnHand.toFixed(4)}.`,
        );
      }
      // Destination branch — may or may not have a level row yet.
      const toBranch = await tx.branch.findUnique({
        where: { id: dto.toBranchId },
        select: { id: true },
      });
      if (!toBranch) throw new NotFoundException('Destination branch not found.');

      const unitCost = fromLevel.avgUnitCost ?? item.lastUnitCost ?? null;
      const totalCost = unitCost ? qty.mul(unitCost) : null;
      const ref = dto.reference?.trim() || `TRF-${Date.now().toString(36).toUpperCase()}`;
      const now = new Date();

      // Source side
      const newFromQty = fromLevel.quantityOnHand.sub(qty);
      await tx.branchStockLevel.update({
        where: { id: fromLevel.id },
        data: { quantityOnHand: newFromQty, lastMovementAt: now },
      });
      const outMovement = await tx.stockMovement.create({
        data: {
          stockItemId: dto.stockItemId,
          branchId: dto.fromBranchId,
          type: StockMovementType.TRANSFER_OUT,
          quantity: qty.neg(),
          unitCost,
          totalCost: totalCost ? totalCost.neg() : null,
          recordedById: userId,
          reference: ref,
          note: dto.note?.trim() || null,
        },
      });

      // Destination side — upsert level + weighted average
      const toExisting = await tx.branchStockLevel.findUnique({
        where: {
          branchId_stockItemId: {
            branchId: dto.toBranchId,
            stockItemId: dto.stockItemId,
          },
        },
      });
      let newToQty: Prisma.Decimal;
      let newToAvg: Prisma.Decimal | null;
      if (toExisting) {
        const prevQty = toExisting.quantityOnHand;
        const prevAvg = toExisting.avgUnitCost ?? new Prisma.Decimal(0);
        newToQty = prevQty.add(qty);
        if (unitCost && newToQty.greaterThan(0)) {
          const weightedPrev = prevAvg.mul(prevQty);
          const weightedIn = unitCost.mul(qty);
          newToAvg = weightedPrev.add(weightedIn).div(newToQty);
        } else {
          newToAvg = unitCost ?? toExisting.avgUnitCost;
        }
        await tx.branchStockLevel.update({
          where: { id: toExisting.id },
          data: {
            quantityOnHand: newToQty,
            avgUnitCost: newToAvg,
            lastMovementAt: now,
          },
        });
      } else {
        newToQty = qty;
        newToAvg = unitCost ?? null;
        await tx.branchStockLevel.create({
          data: {
            branchId: dto.toBranchId,
            stockItemId: dto.stockItemId,
            quantityOnHand: newToQty,
            avgUnitCost: newToAvg,
            lastMovementAt: now,
          },
        });
      }
      const inMovement = await tx.stockMovement.create({
        data: {
          stockItemId: dto.stockItemId,
          branchId: dto.toBranchId,
          type: StockMovementType.TRANSFER_IN,
          quantity: qty,
          unitCost,
          totalCost,
          recordedById: userId,
          reference: ref,
          note: dto.note?.trim() || null,
        },
      });
      return {
        reference: ref,
        out: this.serializeMovementResult(outMovement, newFromQty),
        in: this.serializeMovementResult(inMovement, newToQty),
      };
    });
  }

  // ── Physical stocktake ─────────────────────────────────────────────────────
  /**
   * Converts a physical count into zero or more `ADJUSTMENT` movements —
   * one per line whose counted qty differs from the system's current
   * on-hand. Items on the sheet that match the system (delta=0) are
   * intentionally skipped so the audit trail stays terse.
   */
  async stocktake(dto: StocktakeDto, userId: string) {
    const ref = dto.reference?.trim() || `COUNT-${Date.now().toString(36).toUpperCase()}`;
    return this.prisma.$transaction(async (tx) => {
      const branch = await tx.branch.findUnique({
        where: { id: dto.branchId },
        select: { id: true },
      });
      if (!branch) throw new NotFoundException('Branch not found.');

      const results: Array<{
        stockItemId: string;
        counted: string;
        previous: string;
        delta: string;
        adjusted: boolean;
      }> = [];

      for (const line of dto.lines) {
        const { level, item } = await this.ensureItemAndLevel(
          tx,
          line.stockItemId,
          dto.branchId,
        );
        const counted = new Prisma.Decimal(line.countedQuantity);
        const delta = counted.sub(level.quantityOnHand);
        results.push({
          stockItemId: line.stockItemId,
          counted: counted.toFixed(4),
          previous: level.quantityOnHand.toFixed(4),
          delta: delta.toFixed(4),
          adjusted: !delta.isZero(),
        });
        if (delta.isZero()) continue;

        await tx.branchStockLevel.update({
          where: { id: level.id },
          data: { quantityOnHand: counted, lastMovementAt: new Date() },
        });
        const unitCost = level.avgUnitCost ?? item.lastUnitCost ?? null;
        const totalCost = unitCost ? delta.mul(unitCost) : null;
        await tx.stockMovement.create({
          data: {
            stockItemId: line.stockItemId,
            branchId: dto.branchId,
            type: StockMovementType.ADJUSTMENT,
            quantity: delta,
            unitCost,
            totalCost,
            recordedById: userId,
            reference: ref,
            note: line.note?.trim() || dto.note?.trim() || 'Physical stocktake adjustment',
          },
        });
      }
      return {
        reference: ref,
        branchId: dto.branchId,
        totalLines: dto.lines.length,
        adjustedLines: results.filter((r) => r.adjusted).length,
        results,
      };
    });
  }

  // ── Low-stock alerts ───────────────────────────────────────────────────────
  /**
   * Snapshot of every branch-level row currently at or below reorder point
   * (including OUT_OF_STOCK). Used by the daily cron and the owner widget.
   */
  async lowStock(branchId?: string) {
    const levels = await this.prisma.branchStockLevel.findMany({
      where: branchId ? { branchId } : undefined,
      include: {
        stockItem: { select: { code: true, nameAr: true, nameEn: true, unit: true, reorderPointDefault: true } },
        branch: { select: { id: true, name: true } },
      },
    });
    const rows = levels
      .map((l) => {
        const reorder = l.reorderPoint ?? l.stockItem.reorderPointDefault;
        const status = deriveStatus(l.quantityOnHand, reorder);
        return {
          stockItemId: l.stockItemId,
          code: l.stockItem.code,
          nameAr: l.stockItem.nameAr,
          nameEn: l.stockItem.nameEn,
          unit: l.stockItem.unit,
          branchId: l.branchId,
          branchName: l.branch.name,
          quantityOnHand: l.quantityOnHand.toFixed(4),
          reorderPoint: reorder.toFixed(4),
          status,
        };
      })
      .filter((r) => r.status !== 'IN_STOCK')
      .sort((a, b) =>
        a.status === b.status
          ? a.branchName.localeCompare(b.branchName)
          : a.status === 'OUT_OF_STOCK'
            ? -1
            : 1,
      );
    return {
      rows,
      summary: {
        total: rows.length,
        outOfStock: rows.filter((r) => r.status === 'OUT_OF_STOCK').length,
        lowStock: rows.filter((r) => r.status === 'LOW_STOCK').length,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  // ── Movements (audit) ──────────────────────────────────────────────────────

  async listMovements(q: ListMovementsQueryDto) {
    const where: Prisma.StockMovementWhereInput = {};
    if (q.branchId) where.branchId = q.branchId;
    if (q.stockItemId) where.stockItemId = q.stockItemId;
    if (q.type) where.type = q.type;
    if (q.from || q.to) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (q.from) createdAt.gte = new Date(`${q.from}T00:00:00.000Z`);
      if (q.to) createdAt.lte = new Date(`${q.to}T23:59:59.999Z`);
      where.createdAt = createdAt;
    }
    const take = Math.min(Math.max(q.limit ?? 50, 1), 500);
    const rows = await this.prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
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

  /** Back-compat wrapper; kept for the tiny caller footprint. */
  listRecentMovements(limit = 50, branchId?: string) {
    return this.listMovements({ limit, branchId });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async ensureItemAndLevel(
    tx: Prisma.TransactionClient,
    stockItemId: string,
    branchId: string,
  ) {
    const item = await tx.stockItem.findUnique({ where: { id: stockItemId } });
    if (!item || !item.isActive) {
      throw new NotFoundException('Stock item not found or inactive.');
    }
    const branch = await tx.branch.findUnique({
      where: { id: branchId },
      select: { id: true },
    });
    if (!branch) throw new NotFoundException('Branch not found.');
    let level = await tx.branchStockLevel.findUnique({
      where: { branchId_stockItemId: { branchId, stockItemId } },
    });
    if (!level) {
      level = await tx.branchStockLevel.create({
        data: {
          branchId,
          stockItemId,
          quantityOnHand: new Prisma.Decimal(0),
        },
      });
    }
    return { item, level };
  }

  private serializeMovementResult(
    m: { id: string; stockItemId: string; branchId: string; type: StockMovementType; quantity: Prisma.Decimal; unitCost: Prisma.Decimal | null; totalCost: Prisma.Decimal | null; reference: string | null; createdAt: Date },
    newQtyOnHand: Prisma.Decimal,
  ) {
    return {
      id: m.id,
      stockItemId: m.stockItemId,
      branchId: m.branchId,
      type: m.type,
      quantity: m.quantity.toFixed(4),
      unitCost: m.unitCost?.toFixed(4) ?? null,
      totalCost: m.totalCost?.toFixed(4) ?? null,
      reference: m.reference,
      newQuantityOnHand: newQtyOnHand.toFixed(4),
      createdAt: m.createdAt.toISOString(),
    };
  }
}
