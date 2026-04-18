import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { CallCenterService } from './call-center.service';
import { ActivateSubscriptionDto } from './dto/activate-subscription.dto';
import { DebtRecoveryQueryDto } from './dto/debt-recovery-report.dto';

@ApiTags('call-center')
@ApiBearerAuth('bearer')
@Controller('call-center')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(SafariRole.CALL_CENTER)
export class CallCenterController {
  constructor(private readonly callCenterService: CallCenterService) {}

  @Get('operations-summary')
  @Roles(SafariRole.CALL_CENTER, SafariRole.OWNER)
  @ApiOperation({
    summary: `Call center operations summary — 3 KPIs (${APP_BRAND})`,
    description:
      'RED total market debt (Σ CustomerWallet.debt), GREEN debt collected today (Σ metadata.debtSettled), YELLOW count of open UNPAID orders with a hosted payment URL awaiting action.',
  })
  operationsSummary() {
    return this.callCenterService.getOperationsSummary();
  }

  @Get('debt-recovery-report')
  @Roles(SafariRole.OWNER)
  @ApiOperation({
    summary: `Debt recovery over time — owner reporting (${APP_BRAND})`,
    description:
      'OWNER only. Daily breakdown of debt-settled KWD (from ORDER_WALLET_SETTLEMENT + SUBSCRIPTION_ACTIVATION metadata.debtSettled). Defaults to last 30 days.',
  })
  debtRecoveryReport(@Query() q: DebtRecoveryQueryDto) {
    return this.callCenterService.getDebtRecoveryReport(q.from, q.to);
  }

  @Get('subscription-plans')
  @ApiOperation({
    summary: `List active subscription plans (${APP_BRAND})`,
    description:
      'CALL_CENTER only. Read-only catalog for activation (pay X → credit Y).',
  })
  listPlans() {
    return this.callCenterService.listActiveSubscriptionPlans();
  }

  @Get('customers')
  @ApiOperation({
    summary: `Search customers (${APP_BRAND})`,
    description:
      'CALL_CENTER only. Matches phone or address (case-insensitive), max 50 results.',
  })
  searchCustomers(@Query('q') q: string) {
    return this.callCenterService.searchCustomers(q ?? '');
  }

  @Post('subscriptions/activate')
  @ApiOperation({
    summary: `Activate subscription for customer (${APP_BRAND})`,
    description:
      'CALL_CENTER only. Collected plan price is applied to customer debt first (automatic settlement), then the remainder of the plan credit increases prepaid balance. All wallet updates run inside this transaction — no bypass.',
  })
  activateSubscription(
    @Body() dto: ActivateSubscriptionDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.callCenterService.activateSubscription(user.userId, dto);
  }

  @Get('customers/:customerId/settlements')
  @ApiOperation({
    summary: `Customer settlement history (${APP_BRAND})`,
    description:
      'CALL_CENTER only. Recent subscription activations and order wallet settlements with debt/balance breakdown when recorded.',
  })
  listSettlements(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.callCenterService.listCustomerSettlementHistory(customerId);
  }
}
