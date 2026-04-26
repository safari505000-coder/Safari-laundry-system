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

  // A3.D9 — previously there was a `GET /reports/manager-summary`
  // placeholder that just echoed hard-coded zeros. It had no frontend
  // consumer and served only as a "coming soon" stub; removed to stop
  // misleading anyone reading the Swagger UI. Real management dashboards
  // live at `issued-invoices`, `driver-ledger`, and `daily-cash-closing`.

  @Get('issued-invoices')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.SUPERVISOR,
    SafariRole.VIEWER,
  )
  @ApiOperation({
    summary: `Issued invoices — orders created in period (${APP_BRAND})`,
    description:
      'A3.D6 — Time axis is Order.createdAt (invoice-issuance time). Includes canceled rows so the count ties to the serial counter. For a "completed in range" view use /reports/completed-orders which filters on Order.completedAt instead (the axis the Executive P&L uses).',
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
      'OWNER only. Safari Pulse feed (last N orders by createdAt, all branches). Locked to OWNER at the API layer regardless of UI route guards.',
  })
  liveFeed(@Query() q: LiveFeedQueryDto) {
    return this.reportsService.liveFeedRecent(q.limit ?? 10);
  }

  @Get('driver-ledger')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
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
    SafariRole.GENERAL_MANAGER,
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
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
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

  @Get('monthly-summary')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({
    summary: `Monthly summary — consolidated P&L + per-branch rows (${APP_BRAND})`,
    description:
      'V19.13 — Single endpoint feeding the "الملخص الشهري" screen. Returns one consolidated block (all branches) and an array with the same metrics scoped to every active branch. OWNER + GENERAL_MANAGER only — executive oversight, not an accountant tool. Shares the same math as /reports/executive-summary so reconciliation is guaranteed.',
  })
  monthlySummary(@Query() q: ReportsRangeQueryDto) {
    return this.reportsService.monthlySummary(q.from, q.to);
  }

  @Get('money-flow-statement')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
  )
  @ApiOperation({
    summary: `Money flow statement — income, deductions, expenses, ledger rollups (${APP_BRAND})`,
    description:
      'V19.24 — Consolidated executive lines (same as /reports/executive-summary), approved branch/vehicle expenses, accrued fixed costs by category, collections split, prior-period invoice debt payments, plus GL / wallet / debt ledger rollups for the window.',
  })
  moneyFlowStatement(@Query() q: ReportsRangeQueryDto) {
    return this.reportsService.moneyFlowStatement(q.from, q.to);
  }

  @Get('bank-fees-by-branch')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
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
