import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { ListSubscribersQueryDto } from './dto/list-subscribers-query.dto';
import type { SubscriberListRow } from './subscribers.service';
import { SubscribersService } from './subscribers.service';

@ApiTags('subscribers')
@ApiBearerAuth('bearer')
@Controller('subscribers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubscribersController {
  constructor(private readonly subscribersService: SubscribersService) {}

  @Get()
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
  )
  @ApiOperation({
    summary: `Subscriber list (${APP_BRAND})`,
    description:
      'V20.3.2 — by default, returns ONLY customers with a currently-active ' +
      'CustomerSubscription (status === ACTIVE AND expiresAt > now). Debt / ' +
      'payment / wallet state never determines membership. Pass ' +
      '`?includeInactive=true` to fall back to the legacy behaviour that ' +
      'also returns customers with subscription history but no current ' +
      'active subscription. `?q=` filters by phone or display name.',
  })
  list(@Query() query: ListSubscribersQueryDto): Promise<SubscriberListRow[]> {
    return this.subscribersService.list(query.q, {
      includeInactive: query.includeInactive ?? false,
    });
  }
}
