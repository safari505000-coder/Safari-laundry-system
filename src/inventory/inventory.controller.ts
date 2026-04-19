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
import { ListMovementsQueryDto } from './dto/list-movements-query.dto';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import { StockInDto } from './dto/stock-in.dto';
import { StockOutDto } from './dto/stock-out.dto';
import { StockTransferDto } from './dto/stock-transfer.dto';
import { StocktakeDto } from './dto/stocktake.dto';
import { InventoryService } from './inventory.service';
import { LowStockCronService } from './low-stock-cron.service';

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
  constructor(
    private readonly inventory: InventoryService,
    private readonly lowStockCron: LowStockCronService,
  ) {}

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
  @ApiOperation({
    summary: 'List stock movements (audit)',
    description:
      'Filter by branch, item, type, and/or date range. Returns the most recent movements first, capped at 500 rows.',
  })
  listMovements(@Query() q: ListMovementsQueryDto) {
    return this.inventory.listMovements(q);
  }

  @Post('stock-out')
  @Roles(SafariRole.ACCOUNTANT, SafariRole.GENERAL_MANAGER, SafariRole.MANAGER)
  @ApiOperation({
    summary: 'Record stock consumption (STOCK_OUT)',
    description:
      'Decrements BranchStockLevel.quantityOnHand and writes a StockMovement(STOCK_OUT) with negative quantity. Rejects below-zero writes.',
  })
  stockOut(@Body() dto: StockOutDto, @CurrentUser() user: JwtUser) {
    return this.inventory.stockOut(dto, user.userId);
  }

  @Post('adjust')
  @Roles(SafariRole.ACCOUNTANT, SafariRole.GENERAL_MANAGER)
  @ApiOperation({
    summary: 'Signed stock adjustment (ADJUSTMENT)',
    description:
      'Applies a signed delta (breakage / count correction / write-off). Reason is mandatory and stored on the movement.',
  })
  adjust(@Body() dto: StockAdjustmentDto, @CurrentUser() user: JwtUser) {
    return this.inventory.adjust(dto, user.userId);
  }

  @Post('transfer')
  @Roles(SafariRole.ACCOUNTANT, SafariRole.GENERAL_MANAGER)
  @ApiOperation({
    summary: 'Transfer stock between two branches',
    description:
      'Atomic TRANSFER_OUT + TRANSFER_IN pair sharing one reference. The destination branch cost is weighted-averaged.',
  })
  transfer(@Body() dto: StockTransferDto, @CurrentUser() user: JwtUser) {
    return this.inventory.transfer(dto, user.userId);
  }

  @Post('stocktake')
  @Roles(SafariRole.ACCOUNTANT, SafariRole.GENERAL_MANAGER)
  @ApiOperation({
    summary: 'Submit a physical stocktake',
    description:
      'For each line, computes counted − system delta and emits one ADJUSTMENT per non-zero delta. Zero-delta lines are ignored.',
  })
  stocktake(@Body() dto: StocktakeDto, @CurrentUser() user: JwtUser) {
    return this.inventory.stocktake(dto, user.userId);
  }

  @Get('low-stock')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Low-stock & out-of-stock snapshot',
    description:
      'Returns every branch-level row at or below its reorder point, sorted OUT_OF_STOCK first. Powers the owner widget and the nightly alert cron.',
  })
  lowStock(@Query('branchId') branchId?: string) {
    return this.inventory.lowStock(branchId?.trim() || undefined);
  }

  @Get('low-stock/latest')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Last persisted low-stock snapshot (cached by the 06:00 cron).',
  })
  lowStockLatest() {
    return this.lowStockCron.latestSnapshot();
  }
}
