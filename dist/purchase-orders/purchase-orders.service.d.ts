import { Prisma, PurchaseOrderStatus } from '@prisma/client';
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
    stockItem: {
        code: string;
        nameAr: string;
        unit: string;
    };
    quantityOrdered: Prisma.Decimal | string;
    quantityReceived: Prisma.Decimal | string;
    unitCost: Prisma.Decimal | string;
    lineTotal: Prisma.Decimal | string;
};
export declare class PurchaseOrdersService {
    private readonly prisma;
    private readonly inventory;
    private readonly logger;
    constructor(prisma: PrismaService, inventory: InventoryService);
    create(dto: CreatePurchaseOrderDto, userId: string): Promise<PurchaseOrderDetail>;
    send(id: string, userId: string): Promise<PurchaseOrderDetail>;
    cancel(id: string, reason: string | undefined, userId: string): Promise<PurchaseOrderDetail>;
    receive(id: string, dto: ReceivePurchaseOrderDto, userId: string): Promise<PurchaseOrderDetail>;
    list(q: ListPurchaseOrdersQueryDto): Promise<{
        rows: PurchaseOrderListRow[];
        total: number;
    }>;
    findOne(id: string): Promise<PurchaseOrderDetail>;
    private mustFind;
    private nextPoNumber;
    static _lineShape(l: SerializableLine): SerializableLine;
}
export {};
