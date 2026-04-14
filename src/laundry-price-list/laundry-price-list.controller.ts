import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { APP_BRAND } from '../common/constants/branding';
import { LaundryPriceListService } from './laundry-price-list.service';

@ApiTags('laundry-price-list')
@ApiBearerAuth('bearer')
@Controller('laundry-price-list')
@UseGuards(JwtAuthGuard)
export class LaundryPriceListController {
  constructor(private readonly laundryPriceListService: LaundryPriceListService) {}

  @Get()
  @ApiOperation({
    summary: `Laundry garment price list (${APP_BRAND})`,
    description:
      'Official KD prices per item and tier (normal, urgent, press-only, urgent+press). Manual-entry items use 0.000 until staff enters price.',
  })
  findAll() {
    return this.laundryPriceListService.findAllForApi();
  }
}
