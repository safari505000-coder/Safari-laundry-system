"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
function deriveStatus(qty, reorder) {
    if (qty.lessThanOrEqualTo(0))
        return 'OUT_OF_STOCK';
    if (qty.lessThanOrEqualTo(reorder))
        return 'LOW_STOCK';
    return 'IN_STOCK';
}
let InventoryService = class InventoryService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async listSuppliers() {
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
    async createSupplier(dto) {
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
    async listCategories() {
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
    async createCategory(dto) {
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
    async listItems() {
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
    async createItem(dto) {
        if (dto.categoryId) {
            const cat = await this.prisma.inventoryCategory.findUnique({
                where: { id: dto.categoryId },
                select: { id: true },
            });
            if (!cat)
                throw new common_1.NotFoundException('Category not found');
        }
        const row = await this.prisma.stockItem.create({
            data: {
                code: dto.code.trim(),
                nameAr: dto.nameAr.trim(),
                nameEn: dto.nameEn?.trim() || null,
                unit: dto.unit?.trim() || 'pcs',
                categoryId: dto.categoryId ?? null,
                reorderPointDefault: new client_1.Prisma.Decimal(dto.reorderPointDefault ?? 0),
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
    async report(q) {
        const where = {};
        if (q.branchId)
            where.branchId = q.branchId;
        if (q.categoryId)
            where.stockItem = { categoryId: q.categoryId };
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
        const mapped = levels.map((l) => {
            const reorder = l.reorderPoint ?? l.stockItem.reorderPointDefault;
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
        const filtered = q.status === undefined
            ? mapped
            : mapped.filter((r) => r.status === q.status);
        let totalValue = new client_1.Prisma.Decimal(0);
        let inStock = 0;
        let lowStock = 0;
        let outOfStock = 0;
        for (const r of filtered) {
            if (r.status === 'IN_STOCK')
                inStock++;
            else if (r.status === 'LOW_STOCK')
                lowStock++;
            else
                outOfStock++;
            const unitCost = r.avgUnitCost ?? r.lastUnitCost;
            if (unitCost) {
                totalValue = totalValue.add(new client_1.Prisma.Decimal(r.quantityOnHand).mul(new client_1.Prisma.Decimal(unitCost)));
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
    async stockIn(dto, userId) {
        const item = await this.prisma.stockItem.findUnique({
            where: { id: dto.stockItemId },
        });
        if (!item || !item.isActive) {
            throw new common_1.NotFoundException('Stock item not found or inactive');
        }
        const branch = await this.prisma.branch.findUnique({
            where: { id: dto.branchId },
            select: { id: true },
        });
        if (!branch)
            throw new common_1.NotFoundException('Branch not found');
        if (!dto.supplierId && !dto.supplierName?.trim()) {
            throw new common_1.BadRequestException('Supplier required: supply either supplierId or supplierName.');
        }
        const receivedQty = new client_1.Prisma.Decimal(dto.quantity);
        const unitCost = new client_1.Prisma.Decimal(dto.unitCost);
        const totalCost = receivedQty.mul(unitCost);
        return this.prisma.$transaction(async (tx) => {
            let supplierId = dto.supplierId ?? null;
            if (!supplierId && dto.supplierName) {
                const created = await tx.supplier.create({
                    data: { name: dto.supplierName.trim() },
                });
                supplierId = created.id;
            }
            const existing = await tx.branchStockLevel.findUnique({
                where: {
                    branchId_stockItemId: {
                        branchId: dto.branchId,
                        stockItemId: dto.stockItemId,
                    },
                },
            });
            let newQty;
            let newAvg;
            if (existing) {
                const prevQty = existing.quantityOnHand;
                const prevAvg = existing.avgUnitCost ?? new client_1.Prisma.Decimal(0);
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
            }
            else {
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
                    type: client_1.StockMovementType.STOCK_IN,
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
    async stockOut(dto, userId) {
        return this.prisma.$transaction(async (tx) => {
            const { level, item } = await this.ensureItemAndLevel(tx, dto.stockItemId, dto.branchId);
            const qty = new client_1.Prisma.Decimal(dto.quantity);
            if (level.quantityOnHand.lessThan(qty)) {
                throw new common_1.BadRequestException(`Insufficient stock at branch. Available: ${level.quantityOnHand.toFixed(4)}, requested: ${qty.toFixed(4)}.`);
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
                    type: client_1.StockMovementType.STOCK_OUT,
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
    async adjust(dto, userId) {
        if (dto.delta === 0) {
            throw new common_1.BadRequestException('delta must not be zero.');
        }
        return this.prisma.$transaction(async (tx) => {
            const { level, item } = await this.ensureItemAndLevel(tx, dto.stockItemId, dto.branchId);
            const delta = new client_1.Prisma.Decimal(dto.delta);
            const newQty = level.quantityOnHand.add(delta);
            if (newQty.isNegative()) {
                throw new common_1.BadRequestException(`Adjustment would take stock below zero (current: ${level.quantityOnHand.toFixed(4)}).`);
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
                    type: client_1.StockMovementType.ADJUSTMENT,
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
    async transfer(dto, userId) {
        if (dto.fromBranchId === dto.toBranchId) {
            throw new common_1.BadRequestException('fromBranchId and toBranchId must differ.');
        }
        return this.prisma.$transaction(async (tx) => {
            const { level: fromLevel, item } = await this.ensureItemAndLevel(tx, dto.stockItemId, dto.fromBranchId);
            const qty = new client_1.Prisma.Decimal(dto.quantity);
            if (fromLevel.quantityOnHand.lessThan(qty)) {
                throw new common_1.BadRequestException(`Insufficient stock at source branch. Available: ${fromLevel.quantityOnHand.toFixed(4)}.`);
            }
            const toBranch = await tx.branch.findUnique({
                where: { id: dto.toBranchId },
                select: { id: true },
            });
            if (!toBranch)
                throw new common_1.NotFoundException('Destination branch not found.');
            const unitCost = fromLevel.avgUnitCost ?? item.lastUnitCost ?? null;
            const totalCost = unitCost ? qty.mul(unitCost) : null;
            const ref = dto.reference?.trim() || `TRF-${Date.now().toString(36).toUpperCase()}`;
            const now = new Date();
            const newFromQty = fromLevel.quantityOnHand.sub(qty);
            await tx.branchStockLevel.update({
                where: { id: fromLevel.id },
                data: { quantityOnHand: newFromQty, lastMovementAt: now },
            });
            const outMovement = await tx.stockMovement.create({
                data: {
                    stockItemId: dto.stockItemId,
                    branchId: dto.fromBranchId,
                    type: client_1.StockMovementType.TRANSFER_OUT,
                    quantity: qty.neg(),
                    unitCost,
                    totalCost: totalCost ? totalCost.neg() : null,
                    recordedById: userId,
                    reference: ref,
                    note: dto.note?.trim() || null,
                },
            });
            const toExisting = await tx.branchStockLevel.findUnique({
                where: {
                    branchId_stockItemId: {
                        branchId: dto.toBranchId,
                        stockItemId: dto.stockItemId,
                    },
                },
            });
            let newToQty;
            let newToAvg;
            if (toExisting) {
                const prevQty = toExisting.quantityOnHand;
                const prevAvg = toExisting.avgUnitCost ?? new client_1.Prisma.Decimal(0);
                newToQty = prevQty.add(qty);
                if (unitCost && newToQty.greaterThan(0)) {
                    const weightedPrev = prevAvg.mul(prevQty);
                    const weightedIn = unitCost.mul(qty);
                    newToAvg = weightedPrev.add(weightedIn).div(newToQty);
                }
                else {
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
            }
            else {
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
                    type: client_1.StockMovementType.TRANSFER_IN,
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
    async stocktake(dto, userId) {
        const ref = dto.reference?.trim() || `COUNT-${Date.now().toString(36).toUpperCase()}`;
        return this.prisma.$transaction(async (tx) => {
            const branch = await tx.branch.findUnique({
                where: { id: dto.branchId },
                select: { id: true },
            });
            if (!branch)
                throw new common_1.NotFoundException('Branch not found.');
            const results = [];
            for (const line of dto.lines) {
                const { level, item } = await this.ensureItemAndLevel(tx, line.stockItemId, dto.branchId);
                const counted = new client_1.Prisma.Decimal(line.countedQuantity);
                const delta = counted.sub(level.quantityOnHand);
                results.push({
                    stockItemId: line.stockItemId,
                    counted: counted.toFixed(4),
                    previous: level.quantityOnHand.toFixed(4),
                    delta: delta.toFixed(4),
                    adjusted: !delta.isZero(),
                });
                if (delta.isZero())
                    continue;
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
                        type: client_1.StockMovementType.ADJUSTMENT,
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
    async applyOrderStockDecrement(tx, args) {
        if (!args.branchId)
            return;
        const lines = await tx.orderLineItem.findMany({
            where: { orderId: args.orderId, stockItemId: { not: null } },
            select: { id: true, stockItemId: true, quantity: true, label: true },
        });
        if (lines.length === 0)
            return;
        const branch = await tx.branch.findUnique({
            where: { id: args.branchId },
            select: { id: true },
        });
        if (!branch)
            return;
        const reference = args.reference?.trim() || `ORDER-${args.orderId.slice(0, 8)}`;
        for (const line of lines) {
            if (!line.stockItemId)
                continue;
            const item = await tx.stockItem.findUnique({
                where: { id: line.stockItemId },
            });
            if (!item)
                continue;
            let level = await tx.branchStockLevel.findUnique({
                where: {
                    branchId_stockItemId: {
                        branchId: args.branchId,
                        stockItemId: line.stockItemId,
                    },
                },
            });
            if (!level) {
                level = await tx.branchStockLevel.create({
                    data: {
                        branchId: args.branchId,
                        stockItemId: line.stockItemId,
                        quantityOnHand: new client_1.Prisma.Decimal(0),
                    },
                });
            }
            const qty = new client_1.Prisma.Decimal(line.quantity);
            const newQty = level.quantityOnHand.sub(qty);
            const unitCost = level.avgUnitCost ?? item.lastUnitCost ?? null;
            const totalCost = unitCost ? qty.mul(unitCost) : null;
            await tx.branchStockLevel.update({
                where: { id: level.id },
                data: { quantityOnHand: newQty, lastMovementAt: new Date() },
            });
            await tx.stockMovement.create({
                data: {
                    stockItemId: line.stockItemId,
                    branchId: args.branchId,
                    type: client_1.StockMovementType.STOCK_OUT,
                    quantity: qty.neg(),
                    unitCost,
                    totalCost: totalCost ? totalCost.neg() : null,
                    recordedById: args.actorUserId,
                    reference,
                    note: line.label ?? 'POS sale',
                },
            });
        }
    }
    async lowStock(branchId) {
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
            .sort((a, b) => a.status === b.status
            ? a.branchName.localeCompare(b.branchName)
            : a.status === 'OUT_OF_STOCK'
                ? -1
                : 1);
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
    async listMovements(q) {
        const where = {};
        if (q.branchId)
            where.branchId = q.branchId;
        if (q.stockItemId)
            where.stockItemId = q.stockItemId;
        if (q.type)
            where.type = q.type;
        if (q.from || q.to) {
            const createdAt = {};
            if (q.from)
                createdAt.gte = new Date(`${q.from}T00:00:00.000Z`);
            if (q.to)
                createdAt.lte = new Date(`${q.to}T23:59:59.999Z`);
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
    listRecentMovements(limit = 50, branchId) {
        return this.listMovements({ limit, branchId });
    }
    async ensureItemAndLevel(tx, stockItemId, branchId) {
        const item = await tx.stockItem.findUnique({ where: { id: stockItemId } });
        if (!item || !item.isActive) {
            throw new common_1.NotFoundException('Stock item not found or inactive.');
        }
        const branch = await tx.branch.findUnique({
            where: { id: branchId },
            select: { id: true },
        });
        if (!branch)
            throw new common_1.NotFoundException('Branch not found.');
        let level = await tx.branchStockLevel.findUnique({
            where: { branchId_stockItemId: { branchId, stockItemId } },
        });
        if (!level) {
            level = await tx.branchStockLevel.create({
                data: {
                    branchId,
                    stockItemId,
                    quantityOnHand: new client_1.Prisma.Decimal(0),
                },
            });
        }
        return { item, level };
    }
    serializeMovementResult(m, newQtyOnHand) {
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
};
exports.InventoryService = InventoryService;
exports.InventoryService = InventoryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], InventoryService);
//# sourceMappingURL=inventory.service.js.map