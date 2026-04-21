import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { CreateLaundryPriceItemDto } from './dto/create-laundry-price-item.dto';
import { UpdateLaundryCategoryDto } from './dto/update-laundry-category.dto';
import { UpdateLaundryPriceItemDto } from './dto/update-laundry-price-item.dto';
import { LaundryPriceListService } from './laundry-price-list.service';

@ApiTags('laundry-price-list')
@ApiBearerAuth('bearer')
@Controller('laundry-price-list')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LaundryPriceListController {
  constructor(private readonly laundryPriceListService: LaundryPriceListService) {}

  @Get('categories')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.DRIVER,
    SafariRole.WORKER,
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
    SafariRole.ACCOUNTANT,
    SafariRole.SUPERVISOR,
    SafariRole.VIEWER,
  )
  @ApiOperation({ summary: 'Laundry item categories (ordering / grouping)' })
  findCategories() {
    return this.laundryPriceListService.findCategoriesForApi();
  }

  @Get()
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.DRIVER,
    SafariRole.WORKER,
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
    SafariRole.ACCOUNTANT,
    SafariRole.SUPERVISOR,
    SafariRole.VIEWER,
  )
  @ApiOperation({
    summary: `Laundry garment price list (${APP_BRAND})`,
    description:
      'Official KD prices per item and tier, merged with optional branch overrides. Pass branchId query to preview another branch; otherwise the JWT user branch (when present) is used.',
  })
  findAll(
    @Query('branchId') branchId: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    const q = branchId?.trim();
    const effective = q && q.length > 0 ? q : (user.branchId ?? null);
    return this.laundryPriceListService.findPriceListForBranch(effective);
  }

  @Post('items')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({
    summary: `Create master price item — OWNER only (${APP_BRAND})`,
    description:
      'Creates a new laundry tariff row. Prices default to 0 when omitted so the Owner can batch-create items and price them later. The catalog version bumps automatically for live sync across Driver / POS clients.',
  })
  createItem(@Body() dto: CreateLaundryPriceItemDto) {
    return this.laundryPriceListService.createPriceItem(dto);
  }

  @Patch('items/:id')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({
    summary: `Update master price item — OWNER only (${APP_BRAND})`,
    description:
      'Partial update of the master tariff row (prices, name, sort order, category, isActive). Writes bump the catalog version exposed via SafariStream so driver devices auto-reload the POS catalog on next poll. Historical orders are never rewritten — OrderLineItem snapshots unit price and label at creation time.',
  })
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLaundryPriceItemDto,
  ) {
    return this.laundryPriceListService.updatePriceItem(id, dto);
  }

  @Delete('items/:id')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: `Delete master price item — OWNER only (${APP_BRAND})`,
    description:
      'Hard-deletes a tariff row. Refused with 400 when any existing order line already references the item by label (to preserve historical invoices). Owners should then flip `isActive=false` via PATCH to soft-hide instead.',
  })
  deleteItem(@Param('id', ParseUUIDPipe) id: string) {
    return this.laundryPriceListService.deletePriceItem(id);
  }

  @Patch('categories/:id')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({
    summary: `Update item category — OWNER only (${APP_BRAND})`,
  })
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLaundryCategoryDto,
  ) {
    return this.laundryPriceListService.updateCategory(id, dto);
  }
}
