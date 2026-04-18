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
    async listRecentMovements(limit = 50, branchId) {
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
};
exports.InventoryService = InventoryService;
exports.InventoryService = InventoryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], InventoryService);
//# sourceMappingURL=inventory.service.js.map