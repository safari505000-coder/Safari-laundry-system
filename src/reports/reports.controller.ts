import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { DriverLedgerQueryDto } from './dto/driver-ledger-query.dto';
import { LiveFeedQueryDto } from './dto/live-feed-query.dto';
import { ReportsRangeQueryDto } from './dto/reports-range-query.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth('bearer')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('manager-summary')
  @Roles(
    SafariRole.OWNER,
    SafariRole.MANAGER,
    SafariRole.SUPERVISOR,
    SafariRole.ACCOUNTANT,
    SafariRole.VIEWER,
  )
  @ApiOperation({
    summary: `Management report summary (${APP_BRAND})`,
    description: 'Lightweight heartbeat for dashboards.',
  })
  managerSummary() {
    return {
      title: 'Management operations summary',
      period: new Date().toISOString().slice(0, 10),
      branchesActive: 0,
      note: 'Use issued-invoices, driver-ledger, and daily-cash-closing for operational reporting.',
    };
  }

  @Get('issued-invoices')
  @Roles(
    SafariRole.OWNER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.SUPERVISOR,
    SafariRole.VIEWER,
  )
  @ApiOperation({
    summary: `Issued invoices — orders created in period (${APP_BRAND})`,
  })
  issuedInvoices(@Query() q: ReportsRangeQueryDto) {
    return this.reportsService.issuedInvoices(
      q.from,
      q.to,
      q.driverId,
      q.posPaymentMethod,
      q.branchId,
    );
  }

  @Get('live-feed')
  @Roles(SafariRole.OWNER)
  @ApiOperation({
    summary: `Recent invoices — live operations feed (${APP_BRAND})`,
    description:
      'OWNER only. Last N orders by createdAt (all branches). Lightweight vs issued-invoices report.',
  })
  liveFeed(@Query() q: LiveFeedQueryDto) {
    return this.reportsService.liveFeedRecent(q.limit ?? 10);
  }

  @Get('driver-ledger')
  @Roles(
    SafariRole.OWNER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.SUPERVISOR,
    SafariRole.VIEWER,
  )
  @ApiOperation({
    summary: `Driver cash vs office — held COD and period activity (${APP_BRAND})`,
  })
  driverLedger(@Query() q: DriverLedgerQueryDto) {
    return this.reportsService.driverLedger(
      q.driverId,
      q.from,
      q.to,
      q.branchId,
    );
  }

  @Get('daily-cash-closing')
  @Roles(
    SafariRole.OWNER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.SUPERVISOR,
  )
  @ApiOperation({
    summary: `Daily cash closing — gross CASH sales minus expenses (${APP_BRAND})`,
  })
  dailyCashClosing(@Query() q: ReportsRangeQueryDto) {
    return this.reportsService.dailyCashClosing(
      q.from,
      q.to,
      q.branchId,
      q.driverId,
    );
  }

  @Get('executive-summary')
  @Roles(SafariRole.OWNER)
  @ApiOperation({
    summary: `Net profit & executive KPIs (${APP_BRAND})`,
    description:
      'Gross completed sales minus bank fees (non-cash rails), SOAP/FUEL/MISC variable expenses, paid payroll, and accrued fixed schedules. Invoice totals unchanged.',
  })
  executiveSummary(@Query() q: ReportsRangeQueryDto) {
    return this.reportsService.netProfitExecutive(
      q.from,
      q.to,
      q.branchId,
      q.driverId,
    );
  }

  @Get('bank-fees-by-branch')
  @Roles(SafariRole.OWNER)
  @ApiOperation({
    summary: `Bank fees by branch — completed sales (${APP_BRAND})`,
    description:
      'V8.5 reporting-layer allocation of KNET/card fees per driver branch.',
  })
  bankFeesByBranch(@Query() q: ReportsRangeQueryDto) {
    return this.reportsService.bankFeesByBranch(q.from, q.to);
  }

  @Get('unified-ledger-stream')
  @Roles(
    SafariRole.OWNER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.SUPERVISOR,
    SafariRole.VIEWER,
  )
  @ApiOperation({
    summary: `Unified ledger stream (${APP_BRAND})`,
    description:
      'POS ledger entries, driver field expenses (with receipt pointers), and driver deposits for accountant radar.',
  })
  unifiedLedgerStream(@Query() q: ReportsRangeQueryDto) {
    return this.reportsService.unifiedLedgerStream(
      q.from,
      q.to,
      q.driverId,
      q.branchId,
    );
  }
}
