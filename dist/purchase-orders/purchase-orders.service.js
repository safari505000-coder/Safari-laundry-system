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
var PurchaseOrdersService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PurchaseOrdersService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const inventory_service_1 = require("../inventory/inventory.service");
let PurchaseOrdersService = PurchaseOrdersService_1 = class PurchaseOrdersService {
    prisma;
    inventory;
    logger = new common_1.Logger(PurchaseOrdersService_1.name);
    constructor(prisma, inventory) {
        this.prisma = prisma;
        this.inventory = inventory;
    }
    async create(dto, userId) {
        const supplier = await this.prisma.supplier.findUnique({
            where: { id: dto.supplierId },
        });
        if (!supplier || !supplier.isActive) {
            throw new common_1.NotFoundException('Supplier not found or inactive');
        }
        const branch = await this.prisma.branch.findUnique({
            where: { id: dto.branchId },
        });
        if (!branch)
            throw new common_1.NotFoundException('Branch not found');
        const seenItemIds = new Set();
        for (const line of dto.lines) {
            if (seenItemIds.has(line.stockItemId)) {
                throw new common_1.BadRequestException(`Duplicate stock item in lines: ${line.stockItemId}. Merge into one line.`);
            }
            seenItemIds.add(line.stockItemId);
        }
        const items = await this.prisma.stockItem.findMany({
            where: { id: { in: Array.from(seenItemIds) } },
        });
        if (items.length !== seenItemIds.size) {
            throw new common_1.BadRequestException('One or more stock items not found');
        }
        for (const it of items) {
            if (!it.isActive) {
                throw new common_1.BadRequestException(`Stock item ${it.code} is inactive`);
            }
        }
        const total = dto.lines.reduce((acc, l) => {
            return acc.add(new client_1.Prisma.Decimal(l.quantityOrdered).mul(new client_1.Prisma.Decimal(l.unitCost)));
        }, new client_1.Prisma.Decimal(0));
        const poNumber = await this.nextPoNumber();
        const created = await this.prisma.purchaseOrder.create({
            data: {
                poNumber,
                supplierId: dto.supplierId,
                branchId: dto.branchId,
                status: client_1.PurchaseOrderStatus.DRAFT,
                totalKd: total,
                notes: dto.notes ?? null,
                expectedAt: dto.expectedAt ? new Date(dto.expectedAt) : null,
                createdById: userId,
                lines: {
                    create: dto.lines.map((l) => ({
                        stockItemId: l.stockItemId,
                        quantityOrdered: new client_1.Prisma.Decimal(l.quantityOrdered),
                        unitCost: new client_1.Prisma.Decimal(l.unitCost),
                        lineTotal: new client_1.Prisma.Decimal(l.quantityOrdered).mul(new client_1.Prisma.Decimal(l.unitCost)),
                    })),
                },
            },
        });
        this.logger.log(`PO ${poNumber} created by ${userId} (${dto.lines.length} lines, total=${total.toFixed(3)} KD)`);
        return this.findOne(created.id);
    }
    async send(id, userId) {
        const po = await this.mustFind(id);
        if (po.status !== client_1.PurchaseOrderStatus.DRAFT) {
            throw new common_1.BadRequestException(`PO ${po.poNumber} is ${po.status}; only DRAFT POs can be sent`);
        }
        await this.prisma.purchaseOrder.update({
            where: { id },
            data: {
                status: client_1.PurchaseOrderStatus.SENT,
                approvedById: userId,
                approvedAt: new Date(),
            },
        });
        this.logger.log(`PO ${po.poNumber} sent to supplier by ${userId}`);
        return this.findOne(id);
    }
    async cancel(id, reason, userId) {
        const po = await this.mustFind(id);
        if (po.status === client_1.PurchaseOrderStatus.RECEIVED ||
            po.status === client_1.PurchaseOrderStatus.CANCELLED) {
            throw new common_1.BadRequestException(`PO ${po.poNumber} is ${po.status}; cannot cancel a terminal PO`);
        }
        const anyReceived = await this.prisma.purchaseOrderLine.findFirst({
            where: { purchaseOrderId: id, quantityReceived: { gt: 0 } },
            select: { id: true },
        });
        if (anyReceived) {
            throw new common_1.ForbiddenException('Cannot cancel a PO with already-received lines. Use a stock adjustment.');
        }
        await this.prisma.purchaseOrder.update({
            where: { id },
            data: {
                status: client_1.PurchaseOrderStatus.CANCELLED,
                cancelledAt: new Date(),
                cancelledReason: reason ?? null,
            },
        });
        this.logger.log(`PO ${po.poNumber} cancelled by ${userId}`);
        return this.findOne(id);
    }
    async receive(id, dto, userId) {
        const po = await this.prisma.purchaseOrder.findUnique({
            where: { id },
            include: { lines: true, supplier: true },
        });
        if (!po)
            throw new common_1.NotFoundException('Purchase order not found');
        if (po.status !== client_1.PurchaseOrderStatus.SENT &&
            po.status !== client_1.PurchaseOrderStatus.PARTIALLY_RECEIVED) {
            throw new common_1.BadRequestException(`PO ${po.poNumber} is ${po.status}; only SENT / PARTIALLY_RECEIVED POs can receive stock`);
        }
        const lineById = new Map(po.lines.map((l) => [l.id, l]));
        for (const d of dto.lines) {
            const poLine = lineById.get(d.purchaseOrderLineId);
            if (!poLine) {
                throw new common_1.BadRequestException(`PO line ${d.purchaseOrderLineId} does not belong to this PO`);
            }
            const after = new client_1.Prisma.Decimal(poLine.quantityReceived).add(new client_1.Prisma.Decimal(d.quantityReceived));
            if (after.greaterThan(poLine.quantityOrdered)) {
                throw new common_1.BadRequestException(`Line over-receive: ${after.toFixed(3)} > ordered ${poLine.quantityOrdered.toFixed(3)}`);
            }
        }
        const receipt = await this.prisma.$transaction(async (tx) => {
            const r = await tx.purchaseOrderReceipt.create({
                data: {
                    purchaseOrderId: po.id,
                    receivedById: userId,
                    note: dto.note ?? null,
                },
            });
            for (const d of dto.lines) {
                const poLine = lineById.get(d.purchaseOrderLineId);
                const unitCost = new client_1.Prisma.Decimal(d.unitCost ?? poLine.unitCost);
                const qty = new client_1.Prisma.Decimal(d.quantityReceived);
                await tx.purchaseOrderReceiptLine.create({
                    data: {
                        receiptId: r.id,
                        purchaseOrderLineId: poLine.id,
                        stockItemId: poLine.stockItemId,
                        quantityReceived: qty,
                        unitCost,
                    },
                });
                await tx.purchaseOrderLine.update({
                    where: { id: poLine.id },
                    data: {
                        quantityReceived: new client_1.Prisma.Decimal(poLine.quantityReceived).add(qty),
                    },
                });
            }
            return r;
        });
        for (const d of dto.lines) {
            const poLine = lineById.get(d.purchaseOrderLineId);
            const unitCost = Number(d.unitCost ?? poLine.unitCost);
            await this.inventory.stockIn({
                stockItemId: poLine.stockItemId,
                branchId: po.branchId,
                quantity: Number(d.quantityReceived),
                unitCost,
                supplierId: po.supplierId,
                reference: po.poNumber,
                note: dto.note ?? `Receipt against ${po.poNumber}`,
            }, userId);
        }
        const fresh = await this.prisma.purchaseOrderLine.findMany({
            where: { purchaseOrderId: po.id },
        });
        const allDone = fresh.every((l) => new client_1.Prisma.Decimal(l.quantityReceived).greaterThanOrEqualTo(l.quantityOrdered));
        await this.prisma.purchaseOrder.update({
            where: { id: po.id },
            data: {
                status: allDone
                    ? client_1.PurchaseOrderStatus.RECEIVED
                    : client_1.PurchaseOrderStatus.PARTIALLY_RECEIVED,
            },
        });
        this.logger.log(`PO ${po.poNumber} receipt ${receipt.id} booked by ${userId}; status → ${allDone ? 'RECEIVED' : 'PARTIALLY_RECEIVED'}`);
        return this.findOne(id);
    }
    async list(q) {
        const limit = q.limit ?? 50;
        const offset = q.offset ?? 0;
        const where = {};
        if (q.status)
            where.status = q.status;
        if (q.supplierId)
            where.supplierId = q.supplierId;
        if (q.branchId)
            where.branchId = q.branchId;
        if (q.fromIso || q.toIso) {
            where.createdAt = {};
            if (q.fromIso)
                where.createdAt.gte = new Date(q.fromIso);
            if (q.toIso)
                where.createdAt.lt = new Date(q.toIso);
        }
        const [rows, total] = await Promise.all([
            this.prisma.purchaseOrder.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset,
                include: {
                    supplier: { select: { name: true } },
                    branch: { select: { name: true } },
                    createdBy: { select: { username: true, fullName: true } },
                    lines: {
                        select: {
                            quantityOrdered: true,
                            quantityReceived: true,
                        },
                    },
                },
            }),
            this.prisma.purchaseOrder.count({ where }),
        ]);
        return {
            rows: rows.map((po) => {
                const ordered = po.lines.reduce((a, l) => a.add(l.quantityOrdered), new client_1.Prisma.Decimal(0));
                const received = po.lines.reduce((a, l) => a.add(l.quantityReceived), new client_1.Prisma.Decimal(0));
                const ratio = ordered.isZero()
                    ? 0
                    : Number(received.div(ordered).toFixed(4));
                return {
                    id: po.id,
                    poNumber: po.poNumber,
                    status: po.status,
                    supplierId: po.supplierId,
                    supplierName: po.supplier.name,
                    branchId: po.branchId,
                    branchName: po.branch.name,
                    totalKd: po.totalKd.toFixed(3),
                    expectedAt: po.expectedAt ? po.expectedAt.toISOString() : null,
                    createdAt: po.createdAt.toISOString(),
                    createdById: po.createdById,
                    createdByName: po.createdBy.fullName ?? po.createdBy.username ?? '—',
                    lineCount: po.lines.length,
                    receivedRatio: ratio,
                };
            }),
            total,
        };
    }
    async findOne(id) {
        const po = await this.prisma.purchaseOrder.findUnique({
            where: { id },
            include: {
                supplier: { select: { name: true } },
                branch: { select: { name: true } },
                createdBy: { select: { username: true, fullName: true } },
                lines: {
                    include: {
                        stockItem: {
                            select: { code: true, nameAr: true, unit: true },
                        },
                    },
                    orderBy: { createdAt: 'asc' },
                },
                receipts: {
                    orderBy: { createdAt: 'desc' },
                    include: {
                        receivedBy: { select: { username: true, fullName: true } },
                        lines: {
                            include: {
                                stockItem: { select: { nameAr: true } },
                            },
                        },
                    },
                },
            },
        });
        if (!po)
            throw new common_1.NotFoundException('Purchase order not found');
        const ordered = po.lines.reduce((a, l) => a.add(l.quantityOrdered), new client_1.Prisma.Decimal(0));
        const received = po.lines.reduce((a, l) => a.add(l.quantityReceived), new client_1.Prisma.Decimal(0));
        const ratio = ordered.isZero()
            ? 0
            : Number(received.div(ordered).toFixed(4));
        return {
            id: po.id,
            poNumber: po.poNumber,
            status: po.status,
            supplierId: po.supplierId,
            supplierName: po.supplier.name,
            branchId: po.branchId,
            branchName: po.branch.name,
            totalKd: po.totalKd.toFixed(3),
            expectedAt: po.expectedAt ? po.expectedAt.toISOString() : null,
            createdAt: po.createdAt.toISOString(),
            createdById: po.createdById,
            createdByName: po.createdBy.fullName ?? po.createdBy.username ?? '—',
            lineCount: po.lines.length,
            receivedRatio: ratio,
            notes: po.notes,
            cancelledReason: po.cancelledReason,
            approvedAt: po.approvedAt ? po.approvedAt.toISOString() : null,
            lines: po.lines.map((l) => ({
                id: l.id,
                stockItemId: l.stockItemId,
                stockItemCode: l.stockItem.code,
                stockItemName: l.stockItem.nameAr,
                unit: l.stockItem.unit,
                quantityOrdered: l.quantityOrdered.toFixed(4),
                quantityReceived: l.quantityReceived.toFixed(4),
                unitCost: l.unitCost.toFixed(4),
                lineTotal: l.lineTotal.toFixed(3),
            })),
            receipts: po.receipts.map((r) => ({
                id: r.id,
                receivedAt: r.createdAt.toISOString(),
                receivedByName: r.receivedBy.fullName ?? r.receivedBy.username ?? '—',
                note: r.note,
                lines: r.lines.map((rl) => ({
                    id: rl.id,
                    stockItemId: rl.stockItemId,
                    stockItemName: rl.stockItem.nameAr,
                    quantityReceived: rl.quantityReceived.toFixed(4),
                    unitCost: rl.unitCost.toFixed(4),
                })),
            })),
        };
    }
    async mustFind(id) {
        const po = await this.prisma.purchaseOrder.findUnique({ where: { id } });
        if (!po)
            throw new common_1.NotFoundException('Purchase order not found');
        return po;
    }
    async nextPoNumber() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const stamp = `${y}${m}${d}`;
        const startOfDay = new Date(y, now.getMonth(), now.getDate());
        const endOfDay = new Date(y, now.getMonth(), now.getDate() + 1);
        const count = await this.prisma.purchaseOrder.count({
            where: { createdAt: { gte: startOfDay, lt: endOfDay } },
        });
        const seq = String(count + 1).padStart(4, '0');
        return `PO-${stamp}-${seq}`;
    }
    static _lineShape(l) {
        return l;
    }
};
exports.PurchaseOrdersService = PurchaseOrdersService;
exports.PurchaseOrdersService = PurchaseOrdersService = PurchaseOrdersService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        inventory_service_1.InventoryService])
], PurchaseOrdersService);
//# sourceMappingURL=purchase-orders.service.js.map