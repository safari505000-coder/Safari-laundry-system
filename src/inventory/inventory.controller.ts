import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { CurrentUser, type JwtUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { CreateInventoryCategoryDto } from './dto/create-inventory-category.dto';
import { CreateStockItemDto } from './dto/create-stock-item.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { InventoryReportQueryDto } from './dto/inventory-report-query.dto';
import { StockInDto } from './dto/stock-in.dto';
import { InventoryService } from './inventory.service';

/**
 * Dastur §4 — Smart Inventory & Stock-In.
 * RBAC:
 *  - Report (GET /report):       OWNER + ACCOUNTANT (Branch Manager can be added later)
 *  - Stock-In (POST /stock-in):  ACCOUNTANT only (per Dastur §2.ACCOUNTANT.Stock-In)
 *  - Catalog writes:             OWNER + ACCOUNTANT
 */
@ApiTags('inventory')
@ApiBearerAuth('bearer')
@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('report')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.ACCOUNTANT)
  @ApiOperation({
    summary: `Smart inventory report (${APP_BRAND})`,
    description:
      'Multi-layer filter: category, branch, stock-status. Rows return a server-derived status (IN_STOCK / LOW_STOCK / OUT_OF_STOCK) used for the Yellow/Red colour cues in the UI.',
  })
  getReport(@Query() q: InventoryReportQueryDto) {
    return this.inventory.report(q);
  }

  @Get('categories')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.MANAGER,
  )
  listCategories() {
    return this.inventory.listCategories();
  }

  @Post('categories')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.ACCOUNTANT)
  createCategory(@Body() dto: CreateInventoryCategoryDto) {
    return this.inventory.createCategory(dto);
  }

  @Get('items')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.MANAGER,
  )
  listItems() {
    return this.inventory.listItems();
  }

  @Post('items')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.ACCOUNTANT)
  createItem(@Body() dto: CreateStockItemDto) {
    return this.inventory.createItem(dto);
  }

  @Get('suppliers')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.ACCOUNTANT)
  listSuppliers() {
    return this.inventory.listSuppliers();
  }

  @Post('suppliers')
  @Roles(SafariRole.ACCOUNTANT, SafariRole.GENERAL_MANAGER)
  createSupplier(@Body() dto: CreateSupplierDto) {
    return this.inventory.createSupplier(dto);
  }

  @Post('stock-in')
  @Roles(SafariRole.ACCOUNTANT, SafariRole.GENERAL_MANAGER)
  @ApiOperation({
    summary: `Record stock-in (ACCOUNTANT) (${APP_BRAND})`,
    description:
      'Creates a STOCK_IN movement row, increments BranchStockLevel.quantityOnHand, and updates the weighted moving-average unit cost. Auto-creates a supplier row when supplierName is provided without supplierId.',
  })
  stockIn(@Body() dto: StockInDto, @CurrentUser() user: JwtUser) {
    return this.inventory.stockIn(dto, user.userId);
  }

  @Get('movements')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.ACCOUNTANT)
  listMovements(
    @Query('branchId') branchId?: string,
    @Query('limit') limit?: string,
  ) {
    const n = limit ? Number(limit) : 50;
    return this.inventory.listRecentMovements(
      Number.isFinite(n) ? n : 50,
      branchId?.trim() || undefined,
    );
  }
}
