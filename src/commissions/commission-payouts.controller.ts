import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { CommissionPayoutsService } from './commission-payouts.service';
import { ListCommissionPayoutsDto } from './dto/list-commission-payouts.dto';

/**
 * متحكم مدفوعات العمولات — يتيح للموظفين وأصحاب العمل الاطلاع على مدفوعات العمولات.
 * Commission-payouts controller — allows employees and admins to query commission payout records.
 * Admin roles see all payouts; individual employees see only their own.
 */
@ApiTags('commission-payouts')
@ApiBearerAuth('bearer')
@Controller('commission-payouts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommissionPayoutsController {
  constructor(private readonly service: CommissionPayoutsService) {}

  @Get()
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.MANAGER,
    SafariRole.DRIVER,
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
    SafariRole.SUPERVISOR,
    SafariRole.VIEWER,
  )
  @ApiOperation({
    summary: `List commission payouts in date range (${APP_BRAND})`,
    description:
      'Admin roles see everyone; individual employees only their own payouts.',
  })
  list(@Query() q: ListCommissionPayoutsDto, @CurrentUser() user: JwtUser) {
    return this.service.list(user.role as SafariRole, user.userId, q);
  }
}
