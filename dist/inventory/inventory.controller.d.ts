import { type JwtUser } from '../auth/decorators/current-user.decorator';
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
import { InventoryService } from './inventory.service';
import { LowStockCronService } from './low-stock-cron.service';
export declare class InventoryController {
    private readonly inventory;
    private readonly lowStockCron;
    constructor(inventory: InventoryService, lowStockCron: LowStockCronService);
    getReport(q: InventoryReportQueryDto): Promise<import("./inventory.service").InventoryReportResponse>;
    listCategories(): Promise<import("./inventory.service").InventoryCategoryRow[]>;
    createCategory(dto: CreateInventoryCategoryDto): Promise<import("./inventory.service").InventoryCategoryRow>;
    listItems(): Promise<import("./inventory.service").StockItemRow[]>;
    createItem(dto: CreateStockItemDto): Promise<import("./inventory.service").StockItemRow>;
    listSuppliers(): Promise<import("./inventory.service").SupplierRow[]>;
    createSupplier(dto: CreateSupplierDto): Promise<import("./inventory.service").SupplierRow>;
    stockIn(dto: StockInDto, user: JwtUser): Promise<{
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
    stockOut(dto: StockOutDto, user: JwtUser): Promise<{
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
    adjust(dto: StockAdjustmentDto, user: JwtUser): Promise<{
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
    transfer(dto: StockTransferDto, user: JwtUser): Promise<{
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
    stocktake(dto: StocktakeDto, user: JwtUser): Promise<{
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
            status: import("./inventory.service").InventoryStatus;
        }[];
        summary: {
            total: number;
            outOfStock: number;
            lowStock: number;
            generatedAt: string;
        };
    }>;
    lowStockLatest(): Promise<{
        hadAlerts: boolean;
        recordedAtIso: string;
        report: Awaited<ReturnType<InventoryService["lowStock"]>>;
    } | null>;
}
