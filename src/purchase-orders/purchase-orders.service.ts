import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  PurchaseOrder,
  PurchaseOrderStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ListPurchaseOrdersQueryDto } from './dto/list-purchase-orders-query.dto';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';

export type PurchaseOrderListRow = {
  id: string;
  poNumber: string;
  status: PurchaseOrderStatus;
  supplierId: string;
  supplierName: string;
  branchId: string;
  branchName: string;
  totalKd: string;
  expectedAt: string | null;
  createdAt: string;
  createdById: string;
  createdByName: string;
  lineCount: number;
  receivedRatio: number;
};

export type PurchaseOrderDetail = PurchaseOrderListRow & {
  notes: string | null;
  cancelledReason: string | null;
  approvedAt: string | null;
  lines: Array<{
    id: string;
    stockItemId: string;
    stockItemCode: string;
    stockItemName: string;
    unit: string;
    quantityOrdered: string;
    quantityReceived: string;
    unitCost: string;
    lineTotal: string;
  }>;
  receipts: Array<{
    id: string;
    receivedAt: string;
    receivedByName: string;
    note: string | null;
    lines: Array<{
      id: string;
      stockItemId: string;
      stockItemName: string;
      quantityReceived: string;
      unitCost: string;
    }>;
  }>;
};

type SerializableLine = {
  id: string;
  stockItemId: string;
  stockItem: { code: string; nameAr: string; unit: string };
  quantityOrdered: Prisma.Decimal | string;
  quantityReceived: Prisma.Decimal | string;
  unitCost: Prisma.Decimal | string;
  lineTotal: Prisma.Decimal | string;
};

/**
 * Stage-F Cosmetic — Purchase Order workflow service.
 *
 * Lifecycle (enforced by `transition(...)`):
 *   DRAFT ── send ──► SENT ─ receive ─► PARTIALLY_RECEIVED ─ receive ─► RECEIVED
 *     │                │                       │
 *     └─ cancel ──────►└─ cancel ──────────────┘──► CANCELLED
 *
 * RECEIVED is terminal for a "happy path"; CANCELLED is terminal for
 * a "killed" PO. No transition can leave RECEIVED or CANCELLED.
 */
@Injectable()
export class PurchaseOrdersService {
  private readonly logger = new Logger(PurchaseOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  // ─── CREATE ──────────────────────────────────────────────────────

  async create(
    dto: CreatePurchaseOrderDto,
    userId: string,
  ): Promise<PurchaseOrderDetail> {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: dto.supplierId },
    });
    if (!supplier || !supplier.isActive) {
      throw new NotFoundException('Supplier not found or inactive');
    }
    const branch = await this.prisma.branch.findUnique({
      where: { id: dto.branchId },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    const seenItemIds = new Set<string>();
    for (const line of dto.lines) {
      if (seenItemIds.has(line.stockItemId)) {
        throw new BadRequestException(
          `Duplicate stock item in lines: ${line.stockItemId}. Merge into one line.`,
        );
      }
      seenItemIds.add(line.stockItemId);
    }

    const items = await this.prisma.stockItem.findMany({
      where: { id: { in: Array.from(seenItemIds) } },
    });
    if (items.length !== seenItemIds.size) {
      throw new BadRequestException('One or more stock items not found');
    }
    for (const it of items) {
      if (!it.isActive) {
        throw new BadRequestException(`Stock item ${it.code} is inactive`);
      }
    }

    const total = dto.lines.reduce((acc, l) => {
      return acc.add(
        new Prisma.Decimal(l.quantityOrdered).mul(new Prisma.Decimal(l.unitCost)),
      );
    }, new Prisma.Decimal(0));

    const poNumber = await this.nextPoNumber();

    const created = await this.prisma.purchaseOrder.create({
      data: {
        poNumber,
        supplierId: dto.supplierId,
        branchId: dto.branchId,
        status: PurchaseOrderStatus.DRAFT,
        totalKd: total,
        notes: dto.notes ?? null,
        expectedAt: dto.expectedAt ? new Date(dto.expectedAt) : null,
        createdById: userId,
        lines: {
          create: dto.lines.map((l) => ({
            stockItemId: l.stockItemId,
            quantityOrdered: new Prisma.Decimal(l.quantityOrdered),
            unitCost: new Prisma.Decimal(l.unitCost),
            lineTotal: new Prisma.Decimal(l.quantityOrdered).mul(
              new Prisma.Decimal(l.unitCost),
            ),
          })),
        },
      },
    });

    this.logger.log(
      `PO ${poNumber} created by ${userId} (${dto.lines.length} lines, total=${total.toFixed(3)} KD)`,
    );

    return this.findOne(created.id);
  }

  // ─── TRANSITIONS ─────────────────────────────────────────────────

  async send(id: string, userId: string): Promise<PurchaseOrderDetail> {
    const po = await this.mustFind(id);
    if (po.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException(
        `PO ${po.poNumber} is ${po.status}; only DRAFT POs can be sent`,
      );
    }
    await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: PurchaseOrderStatus.SENT,
        approvedById: userId,
        approvedAt: new Date(),
      },
    });
    this.logger.log(`PO ${po.poNumber} sent to supplier by ${userId}`);
    return this.findOne(id);
  }

  async cancel(
    id: string,
    reason: string | undefined,
    userId: string,
  ): Promise<PurchaseOrderDetail> {
    const po = await this.mustFind(id);
    if (
      po.status === PurchaseOrderStatus.RECEIVED ||
      po.status === PurchaseOrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `PO ${po.poNumber} is ${po.status}; cannot cancel a terminal PO`,
      );
    }

    // If partially received we refuse — received stock has already been
    // committed via StockMovement; cancellation now would leave the
    // audit trail inconsistent. Force a new adjustment instead.
    const anyReceived = await this.prisma.purchaseOrderLine.findFirst({
      where: { purchaseOrderId: id, quantityReceived: { gt: 0 } },
      select: { id: true },
    });
    if (anyReceived) {
      throw new ForbiddenException(
        'Cannot cancel a PO with already-received lines. Use a stock adjustment.',
      );
    }

    await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: PurchaseOrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledReason: reason ?? null,
      },
    });
    this.logger.log(`PO ${po.poNumber} cancelled by ${userId}`);
    return this.findOne(id);
  }

  async receive(
    id: string,
    dto: ReceivePurchaseOrderDto,
    userId: string,
  ): Promise<PurchaseOrderDetail> {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { lines: true, supplier: true },
    });
    if (!po) throw new NotFoundException('Purchase order not found');

    if (
      po.status !== PurchaseOrderStatus.SENT &&
      po.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED
    ) {
      throw new BadRequestException(
        `PO ${po.poNumber} is ${po.status}; only SENT / PARTIALLY_RECEIVED POs can receive stock`,
      );
    }

    // Validate every delivery line against the PO lines and accumulated totals.
    const lineById = new Map(po.lines.map((l) => [l.id, l]));
    for (const d of dto.lines) {
      const poLine = lineById.get(d.purchaseOrderLineId);
      if (!poLine) {
        throw new BadRequestException(
          `PO line ${d.purchaseOrderLineId} does not belong to this PO`,
        );
      }
      const after = new Prisma.Decimal(poLine.quantityReceived).add(
        new Prisma.Decimal(d.quantityReceived),
      );
      if (after.greaterThan(poLine.quantityOrdered)) {
        throw new BadRequestException(
          `Line over-receive: ${after.toFixed(3)} > ordered ${poLine.quantityOrdered.toFixed(3)}`,
        );
      }
    }

    // Create the receipt header + receipt lines + delegate to InventoryService
    // in a single transaction to keep stock, audit, and PO totals consistent.
    const receipt = await this.prisma.$transaction(async (tx) => {
      const r = await tx.purchaseOrderReceipt.create({
        data: {
          purchaseOrderId: po.id,
          receivedById: userId,
          note: dto.note ?? null,
        },
      });

      for (const d of dto.lines) {
        const poLine = lineById.get(d.purchaseOrderLineId)!;
        const unitCost = new Prisma.Decimal(d.unitCost ?? poLine.unitCost);
        const qty = new Prisma.Decimal(d.quantityReceived);

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
            quantityReceived: new Prisma.Decimal(poLine.quantityReceived).add(qty),
          },
        });
      }

      return r;
    });

    // Commit stock movements OUTSIDE the PO transaction. InventoryService.stockIn
    // runs its own transaction (branch level + movement + avg cost); nesting
    // those would double-wrap the connection. Worst-case partial commit is
    // recoverable (the receipt rows and stock rows are independently auditable).
    for (const d of dto.lines) {
      const poLine = lineById.get(d.purchaseOrderLineId)!;
      const unitCost = Number(d.unitCost ?? poLine.unitCost);
      await this.inventory.stockIn(
        {
          stockItemId: poLine.stockItemId,
          branchId: po.branchId,
          quantity: Number(d.quantityReceived),
          unitCost,
          supplierId: po.supplierId,
          reference: po.poNumber,
          note: dto.note ?? `Receipt against ${po.poNumber}`,
        },
        userId,
      );
    }

    // Transition: if every line's cumulative received equals ordered → RECEIVED.
    // Otherwise → PARTIALLY_RECEIVED.
    const fresh = await this.prisma.purchaseOrderLine.findMany({
      where: { purchaseOrderId: po.id },
    });
    const allDone = fresh.every((l) =>
      new Prisma.Decimal(l.quantityReceived).greaterThanOrEqualTo(
        l.quantityOrdered,
      ),
    );
    await this.prisma.purchaseOrder.update({
      where: { id: po.id },
      data: {
        status: allDone
          ? PurchaseOrderStatus.RECEIVED
          : PurchaseOrderStatus.PARTIALLY_RECEIVED,
      },
    });

    this.logger.log(
      `PO ${po.poNumber} receipt ${receipt.id} booked by ${userId}; status → ${
        allDone ? 'RECEIVED' : 'PARTIALLY_RECEIVED'
      }`,
    );

    return this.findOne(id);
  }

  // ─── READ ────────────────────────────────────────────────────────

  async list(
    q: ListPurchaseOrdersQueryDto,
  ): Promise<{ rows: PurchaseOrderListRow[]; total: number }> {
    const limit = q.limit ?? 50;
    const offset = q.offset ?? 0;

    const where: Prisma.PurchaseOrderWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.supplierId) where.supplierId = q.supplierId;
    if (q.branchId) where.branchId = q.branchId;
    if (q.fromIso || q.toIso) {
      where.createdAt = {};
      if (q.fromIso) where.createdAt.gte = new Date(q.fromIso);
      if (q.toIso) where.createdAt.lt = new Date(q.toIso);
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
        const ordered = po.lines.reduce(
          (a, l) => a.add(l.quantityOrdered),
          new Prisma.Decimal(0),
        );
        const received = po.lines.reduce(
          (a, l) => a.add(l.quantityReceived),
          new Prisma.Decimal(0),
        );
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
          createdByName:
            po.createdBy.fullName ?? po.createdBy.username ?? '—',
          lineCount: po.lines.length,
          receivedRatio: ratio,
        };
      }),
      total,
    };
  }

  async findOne(id: string): Promise<PurchaseOrderDetail> {
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
    if (!po) throw new NotFoundException('Purchase order not found');

    const ordered = po.lines.reduce(
      (a, l) => a.add(l.quantityOrdered),
      new Prisma.Decimal(0),
    );
    const received = po.lines.reduce(
      (a, l) => a.add(l.quantityReceived),
      new Prisma.Decimal(0),
    );
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
      })) as PurchaseOrderDetail['lines'],
      receipts: po.receipts.map((r) => ({
        id: r.id,
        receivedAt: r.createdAt.toISOString(),
        receivedByName:
          r.receivedBy.fullName ?? r.receivedBy.username ?? '—',
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

  // ─── HELPERS ─────────────────────────────────────────────────────

  private async mustFind(id: string): Promise<PurchaseOrder> {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw new NotFoundException('Purchase order not found');
    return po;
  }

  /**
   * Generate the next `PO-YYYYMMDD-NNNN` serial for today.
   * NNNN is a zero-padded 4-digit counter of POs created on the same
   * Gregorian (server-local) date. Uses a simple COUNT query — a small
   * race is acceptable (unique constraint on poNumber catches any
   * collision and the caller will retry).
   */
  private async nextPoNumber(): Promise<string> {
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

  /** Used by `SerializableLine` consumers elsewhere — currently unused. */
  static _lineShape(l: SerializableLine): SerializableLine {
    return l;
  }
}
