import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { UpdatePaymentMethodFeesDto } from './dto/update-payment-method-fees.dto';
import { PaymentMethodFeesService } from './payment-method-fees.service';

@ApiTags('payment-method-fees')
@ApiBearerAuth('bearer')
@Controller('payment-method-fees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentMethodFeesController {
  constructor(private readonly feesService: PaymentMethodFeesService) {}

  @Get()
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.SUPERVISOR,
  )
  @ApiOperation({
    summary: `Read global payment-method fee config (${APP_BRAND})`,
    description:
      'Used for reporting-layer bank commission on non-cash electronic settlements.',
  })
  async getConfig() {
    return this.feesService.getConfig();
  }

  @Patch()
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({
    summary: `Update global payment-method fee config (${APP_BRAND})`,
  })
  async patch(@Body() dto: UpdatePaymentMethodFeesDto) {
    // V25 Controller Math Purge: Prisma.Decimal construction and DB write
    // fully delegated to PaymentMethodFeesService.patchConfig.
    return this.feesService.patchConfig(dto);
  }
}
