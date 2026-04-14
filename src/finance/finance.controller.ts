import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { ConfirmHandoverDto } from './dto/confirm-handover.dto';
import { DailyPosSalesQueryDto } from './dto/daily-pos-sales-query.dto';
import {
  DriverBalanceResponseDto,
  HandoverResultDto,
} from './dto/driver-balance.dto';
import { OwnerCustomerWalletSummaryDto } from './dto/owner-customer-wallet-summary.dto';
import { FinanceService } from './finance.service';

@ApiTags('finance')
@ApiBearerAuth('bearer')
@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('owner/customer-wallet-summary')
  @Roles(SafariRole.OWNER)
  @ApiOperation({
    summary: `Owner — customer wallet liabilities & debts (${APP_BRAND})`,
    description:
      'OWNER only. Aggregates CustomerWallet balance (prepaid credit owed) and debt across all customers.',
  })
  getOwnerCustomerWalletSummary(): Promise<OwnerCustomerWalletSummaryDto> {
    return this.financeService.getOwnerCustomerWalletSummary();
  }

  @Get('reports/daily-pos-sales')
  @Roles(
    SafariRole.OWNER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.SUPERVISOR,
  )
  @ApiOperation({
    summary: `Daily POS sales by payment method (${APP_BRAND})`,
    description:
      'Aggregates completed POS orders with recorded PosPaymentMethod (subscription wallet, cash, KNET, payment link) for financial reporting.',
  })
  getDailyPosSales(@Query() q: DailyPosSalesQueryDto) {
    return this.financeService.getDailyPosSalesByPaymentMethod(q.from, q.to);
  }

  @Get('driver-balance')
  @Roles(
    SafariRole.OWNER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.SUPERVISOR,
    SafariRole.VIEWER,
  )
  @ApiOperation({
    summary: `Driver cash on hand (${APP_BRAND})`,
    description:
      'Per driver: sum of COMPLETED orders still PAID_TO_DRIVER (not yet handed to office), plus current OPEN shift metadata. OWNER/MANAGER only.',
  })
  getDriverBalance(): Promise<DriverBalanceResponseDto> {
    return this.financeService.getDriverBalances();
  }

  @Post('handover/confirm')
  @Roles(SafariRole.OWNER, SafariRole.MANAGER, SafariRole.SUPERVISOR)
  @ApiOperation({
    summary: `Confirm cash handover (${APP_BRAND})`,
    description:
      'Atomic settlement: all PAID_TO_DRIVER orders for the driver → HANDED_OVER_TO_OFFICE; OPEN shift → CLOSED with ledger totals. Optional declaredHandoverTotal must match ledger within 0.0001 KWD.',
  })
  confirmHandover(
    @Body() dto: ConfirmHandoverDto,
    @CurrentUser() user: JwtUser,
  ): Promise<HandoverResultDto> {
    return this.financeService.confirmHandover(user.userId, dto);
  }
}
