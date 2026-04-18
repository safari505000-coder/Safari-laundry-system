import { type JwtUser } from '../auth/decorators/current-user.decorator';
import { CreateInventoryCategoryDto } from './dto/create-inventory-category.dto';
import { CreateStockItemDto } from './dto/create-stock-item.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { InventoryReportQueryDto } from './dto/inventory-report-query.dto';
import { StockInDto } from './dto/stock-in.dto';
import { InventoryService } from './inventory.service';
export declare class InventoryController {
    private readonly inventory;
    constructor(inventory: InventoryService);
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
    listMovements(branchId?: string, limit?: string): Promise<{
        id: string;
        type: import("@prisma/client").$Enums.StockMovementType;
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
}
