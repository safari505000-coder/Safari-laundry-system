import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
    SafariRole.MANAGER,
    SafariRole.DRIVER,
    SafariRole.WORKER,
    SafariRole.CALL_CENTER,
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
    SafariRole.MANAGER,
    SafariRole.DRIVER,
    SafariRole.WORKER,
    SafariRole.CALL_CENTER,
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

  @Patch('items/:id')
  @Roles(SafariRole.OWNER)
  @ApiOperation({
    summary: `Update master price item — OWNER only (${APP_BRAND})`,
    description:
      'Partial update of the master tariff row (prices, name, sort order, category). Writes bump the catalog version exposed via SafariStream so driver devices auto-reload the POS catalog on next poll.',
  })
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLaundryPriceItemDto,
  ) {
    return this.laundryPriceListService.updatePriceItem(id, dto);
  }

  @Patch('categories/:id')
  @Roles(SafariRole.OWNER)
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
