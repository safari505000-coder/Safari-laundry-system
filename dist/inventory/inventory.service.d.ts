import { Prisma } from "@prisma/client";
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
export declare class InventoryService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    listSuppliers(): Promise<SupplierRow[]>;
    createSupplier(dto: CreateSupplierDto): Promise<SupplierRow>;
    listCategories(): Promise<InventoryCategoryRow[]>;
    createCategory(dto: CreateInventoryCategoryDto): Promise<InventoryCategoryRow>;
    listItems(): Promise<StockItemRow[]>;
    createItem(dto: CreateStockItemDto): Promise<StockItemRow>;
    report(q: InventoryReportQueryDto): Promise<InventoryReportResponse>;
    stockIn(dto: StockInDto, userId: string): Promise<{
        id: string;
        stockItemId: string;
        branchId: string;
        quantity: string;
        unitCost: string | null;
        totalCost: string | null;
        supplierId: string | null;
        reference: string | null;
        newQuantityOnHand: string;
        newAvgUnitCost: string;
        createdAt: string;
    }>;
    stockOut(dto: StockOutDto, userId: string): Promise<{
        id: string;
        stockItemId: string;
        branchId: string;
        type: import(".prisma/client").$Enums.StockMovementType;
        quantity: string;
        unitCost: string | null;
        totalCost: string | null;
        reference: string | null;
        newQuantityOnHand: string;
        createdAt: string;
    }>;
    adjust(dto: StockAdjustmentDto, userId: string): Promise<{
        id: string;
        stockItemId: string;
        branchId: string;
        type: import(".prisma/client").$Enums.StockMovementType;
        quantity: string;
        unitCost: string | null;
        totalCost: string | null;
        reference: string | null;
        newQuantityOnHand: string;
        createdAt: string;
    }>;
    transfer(dto: StockTransferDto, userId: string): Promise<{
        reference: string;
        out: {
            id: string;
            stockItemId: string;
            branchId: string;
            type: import(".prisma/client").$Enums.StockMovementType;
            quantity: string;
            unitCost: string | null;
            totalCost: string | null;
            reference: string | null;
            newQuantityOnHand: string;
            createdAt: string;
        };
        in: {
            id: string;
            stockItemId: string;
            branchId: string;
            type: import(".prisma/client").$Enums.StockMovementType;
            quantity: string;
            unitCost: string | null;
            totalCost: string | null;
            reference: string | null;
            newQuantityOnHand: string;
            createdAt: string;
        };
    }>;
    stocktake(dto: StocktakeDto, userId: string): Promise<{
        reference: string;
        branchId: string;
        totalLines: number;
        adjustedLines: number;
        results: {
            stockItemId: string;
            counted: string;
            previous: string;
            delta: string;
            adjusted: boolean;
        }[];
    }>;
    applyOrderStockDecrement(tx: Prisma.TransactionClient, args: {
        orderId: string;
        actorUserId: string;
        branchId: string | null | undefined;
        reference?: string | null;
    }): Promise<void>;
    lowStock(branchId?: string): Promise<{
        rows: {
            stockItemId: string;
            code: string;
            nameAr: string;
            nameEn: string | null;
            unit: string;
            branchId: string;
            branchName: string;
            quantityOnHand: string;
            reorderPoint: string;
            status: InventoryStatus;
        }[];
        summary: {
            total: number;
            outOfStock: number;
            lowStock: number;
            generatedAt: string;
        };
    }>;
    listMovements(q: ListMovementsQueryDto): Promise<{
        id: string;
        type: import(".prisma/client").$Enums.StockMovementType;
        stockItem: {
            code: string;
            nameAr: string;
            nameEn: string | null;
            unit: string;
        };
        branchName: string;
        supplierName: string | null;
        recordedBy: {
            username: string;
            fullName: string;
        };
        quantity: string;
        unitCost: string | null;
        totalCost: string | null;
        reference: string | null;
        note: string | null;
        receiptUrl: string | null;
        createdAt: string;
    }[]>;
    listRecentMovements(limit?: number, branchId?: string): Promise<{
        id: string;
        type: import(".prisma/client").$Enums.StockMovementType;
        stockItem: {
            code: string;
            nameAr: string;
            nameEn: string | null;
            unit: string;
        };
        branchName: string;
        supplierName: string | null;
        recordedBy: {
            username: string;
            fullName: string;
        };
        quantity: string;
        unitCost: string | null;
        totalCost: string | null;
        reference: string | null;
        note: string | null;
        receiptUrl: string | null;
        createdAt: string;
    }[]>;
    private ensureItemAndLevel;
    private serializeMovementResult;
}
