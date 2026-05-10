import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma, SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { UpdatePaymentMethodFeesDto } from './dto/update-payment-method-fees.dto';
import { PaymentMethodFeesService } from './payment-method-fees.service';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('payment-method-fees')
@ApiBearerAuth('bearer')
@Controller('payment-method-fees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentMethodFeesController {
  constructor(
    private readonly feesService: PaymentMethodFeesService,
    private readonly prisma: PrismaService,
  ) {}

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
    await this.feesService.ensureDefaultRow();
    const data: Record<string, unknown> = {};
    // V24 — `knetFlatKd` arrives as canonical 4dp KWD string per
    // the V24 input-DTO contract. Convert to Prisma.Decimal here
    // so the persistence layer sees a typed money value, not a
    // raw string. Percent fields stay as numbers (they are ratios,
    // not money).
    if (dto.knetFlatKd !== undefined) {
      data.knetFlatKd = new Prisma.Decimal(dto.knetFlatKd);
    }
    if (dto.knetPercentOfGross !== undefined) {
      data.knetPercentOfGross = dto.knetPercentOfGross;
    }
    if (dto.knetRule !== undefined) data.knetRule = dto.knetRule;
    if (dto.cardPercentOfGross !== undefined) {
      data.cardPercentOfGross = dto.cardPercentOfGross;
    }
    return this.prisma.paymentMethodFeeConfig.update({
      where: { id: 'default' },
      data,
    });
  }
}
