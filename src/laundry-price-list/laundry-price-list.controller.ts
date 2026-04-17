import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { CurrentUser, type JwtUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { LaundryPriceListService } from './laundry-price-list.service';

@ApiTags('laundry-price-list')
@ApiBearerAuth('bearer')
@Controller('laundry-price-list')
@UseGuards(JwtAuthGuard, RolesGuard)
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
export class LaundryPriceListController {
  constructor(private readonly laundryPriceListService: LaundryPriceListService) {}

  @Get('categories')
  @ApiOperation({ summary: 'Laundry item categories (ordering / grouping)' })
  findCategories() {
    return this.laundryPriceListService.findCategoriesForApi();
  }

  @Get()
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
    const effective =
      q && q.length > 0 ? q : (user.branchId ?? null);
    return this.laundryPriceListService.findPriceListForBranch(effective);
  }
}
