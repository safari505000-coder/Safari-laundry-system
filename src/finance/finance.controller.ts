import { existsSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { diskStorage } from 'multer';
import type { Express } from 'express';
import {
  AllowDriverDailyPosSales,
  Roles,
} from '../auth/decorators/roles.decorator';
import { Permissions } from '../auth/permissions/permissions.decorator';
import { AppPermission } from '../auth/permissions/permissions.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { CashWriteEndpoint } from '../cash-monitor/cash-write-police.guard';
import { ConfirmHandoverDto } from './dto/confirm-handover.dto';
import { DebtByCategoryQueryDto } from './dto/debt-by-category-query.dto';
import { GenerateSettlementLinkDto } from './dto/generate-settlement-link.dto';
import {
  OpenDebtByIssuerQueryDto,
  OpenDebtByIssuerResponseDto,
} from './dto/open-debt-by-issuer.dto';
import { DailyPosSalesQueryDto } from './dto/daily-pos-sales-query.dto';
import {
  DriverBalanceResponseDto,
  HandoverResultDto,
} from './dto/driver-balance.dto';
import {
  CashReconciliationQueryDto,
  type CashReconciliationSnapshotDto,
} from './dto/cash-reconciliation.dto';
import {
  DriverCashTraceQueryDto,
  DriverCashTraceResponseDto,
} from './dto/driver-cash-trace.dto';
import { OwnerCustomerWalletSummaryDto } from './dto/owner-customer-wallet-summary.dto';
import { UpdateDriverTrackingDto } from './dto/update-driver-tracking.dto';
import {
  UnpaidInvoicesQueryDto,
  UnpaidInvoicesResponseDto,
} from './dto/unpaid-invoices.dto';
import { AccountantDashboardQueryDto } from './dto/accountant-dashboard-query.dto';
import { FinanceService } from './finance.service';
import { AccountantDashboardService } from './services/accountant-dashboard.service';
import { OwnerFinancialDashboardService } from './services/owner-financial-dashboard.service';

const HANDOVER_RECEIPTS_DIR = join(
  process.cwd(),
  'uploads',
  'handover-receipts',
);
const HANDOVER_RECEIPT_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

@ApiTags('finance')
@ApiBearerAuth('bearer')
@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinanceController {
  constructor(
    private readonly financeService: FinanceService,
    private readonly accountantDashboard: AccountantDashboardService,
    private readonly ownerFinancialDashboard: OwnerFinancialDashboardService,
  ) {}

  @Post('driver/ensure-shift')
  @Roles(SafariRole.DRIVER)
  @ApiOperation({
    summary: `Driver — ensure open shift (auto-rollover) (${APP_BRAND})`,
    description:
      'Driver-only. Ensures exactly one OPEN shift and auto-locks yesterday shift at 23:59:59 Kuwait when crossing midnight.',
  })
  async driverEnsureShift(@CurrentUser() user: JwtUser) {
    await this.financeService.ensureOpenShiftForDriver(user.userId);
    return { ok: true };
  }

  @Get('owner/customer-wallet-summary')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({
    summary: `Owner — customer wallet liabilities & debts (${APP_BRAND})`,
    description:
      'OWNER only. Aggregates CustomerWallet balance (prepaid credit owed) and debt across all customers.',
  })
  getOwnerCustomerWalletSummary(): Promise<OwnerCustomerWalletSummaryDto> {
    return this.financeService.getOwnerCustomerWalletSummary();
  }

  @Get('owner-dashboard')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.ACCOUNTANT)
  @Permissions(AppPermission.VIEW_FINANCIAL_REPORTS, AppPermission.VIEW_CASH)
  @ApiOperation({
    summary: `Owner financial intelligence dashboard (${APP_BRAND})`,
    description:
      'Decision layer on top of canonical customer financials, cached with the finance dashboard cache.',
  })
  getOwnerFinancialDashboard() {
    return this.ownerFinancialDashboard.getDashboard();
  }

  @Get('consolidated-cash')
  @Permissions(AppPermission.VIEW_CASH)
  @ApiOperation({
    summary: `Consolidated cash snapshot (${APP_BRAND})`,
    description:
      'A3.D8 — every pool of KD cash the institution currently holds: driver field cash + manager custody bags (PENDING_DEPOSIT / AWAITING_VERIFICATION) + branch wallets + unverified bank deposit logs. Used by the Owner/Accountant control-panel card so the total is the single source of truth.',
  })
  getConsolidatedCashSnapshot() {
    return this.financeService.getConsolidatedCashSnapshot();
  }

  @Get('reports/daily-pos-sales')
  @AllowDriverDailyPosSales()
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.SUPERVISOR,
  )
  @ApiOperation({
    summary: `Daily POS sales by payment method (${APP_BRAND})`,
    description:
      'Aggregates completed POS orders with recorded PosPaymentMethod (subscription wallet, cash, KNET, ONLINE, DEBT_ON_ACCOUNT) for financial reporting.',
  })
  getDailyPosSales(
    @Query() q: DailyPosSalesQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.financeService.getDailyPosSalesByPaymentMethod(
      q.from,
      q.to,
      user.role === SafariRole.DRIVER ? user.userId : undefined,
    );
  }

  @Get('reports/debt-by-category')
  @Permissions(AppPermission.VIEW_DEBTS)
  @ApiOperation({
    summary: `Debt breakdown by category (${APP_BRAND})`,
    description:
      'Debt totals grouped by category (BRANCH, DRIVER, OWNER, CALL_CENTER) and source (SUBSCRIPTION_OVERUSE, INVOICE_SHORTFALL).',
  })
  getDebtByCategory(@Query() q: DebtByCategoryQueryDto) {
    return this.financeService.getDebtBreakdownByCategory(
      q.from,
      q.to,
      q.category,
      q.branchId,
      q.actorUserId,
    );
  }

  @Get('reports/open-debt-by-issuer')
  @Permissions(AppPermission.VIEW_DEBTS)
  @ApiOperation({
    summary: `NET open debt grouped by invoice issuer (${APP_BRAND})`,
    description:
      'Live snapshot. Per-customer FIFO allocation of PAYMENT entries against INVOICE_SHORTFALL. Σ openDebtKd matches /unpaid-invoices; the Call Center red KPI uses Σ UNPAID order totals (collections list) and may differ when off-list wallet/subscription debt exists.',
  })
  getOpenDebtByIssuer(
    @Query() q: OpenDebtByIssuerQueryDto,
  ): Promise<OpenDebtByIssuerResponseDto> {
    return this.financeService.getOpenDebtByIssuer(q.branchId);
  }

  @Post('handover/upload-receipt')
  @Roles(SafariRole.MANAGER)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({
    summary: `Upload bank deposit receipt image (${APP_BRAND})`,
    description:
      'JPEG, PNG, or WebP, max ~6MB. Returns depositReceiptUrl for POST /finance/handover/confirm.',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          if (!existsSync(HANDOVER_RECEIPTS_DIR)) {
            mkdirSync(HANDOVER_RECEIPTS_DIR, { recursive: true });
          }
          cb(null, HANDOVER_RECEIPTS_DIR);
        },
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase() || '.jpg';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 6 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (HANDOVER_RECEIPT_MIMES.has(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'Only JPEG, PNG, or WebP images are allowed',
            ),
            false,
          );
        }
      },
    }),
  )
  uploadHandoverReceipt(@UploadedFile() file: Express.Multer.File) {
    if (!file?.filename) {
      throw new BadRequestException('Receipt image is required');
    }
    return {
      depositReceiptUrl: `/uploads/handover-receipts/${file.filename}`,
    };
  }

  @Get('driver-balance')
  @Permissions(AppPermission.VIEW_CASH)
  @ApiOperation({
    summary: `Driver cash on hand (${APP_BRAND})`,
    description:
      'Per driver: sum of COMPLETED orders still PAID_TO_DRIVER (not yet handed to office), plus current OPEN shift metadata. OWNER/MANAGER only.',
  })
  getDriverBalance(): Promise<DriverBalanceResponseDto> {
    return this.financeService.getDriverBalances();
  }

  @Get('driver/my-cash-custody')
  @Roles(SafariRole.DRIVER)
  @ApiOperation({
    summary: `Driver — my cash custody summary (${APP_BRAND})`,
    description:
      'Read-only driver-facing cash custody projection: CASH completed orders still PAID_TO_DRIVER. Does not mutate handover state.',
  })
  getMyDriverCashCustody(@CurrentUser() user: JwtUser) {
    return this.financeService.getMyDriverCashCustodySummary(user.userId);
  }

  @Get('driver-monitoring')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
  )
  @ApiOperation({
    summary: `Driver monitoring map feed (${APP_BRAND})`,
    description:
      'V19.22.5 — Safari Pulse map feed of active ON_SHIFT drivers with lastKnownLocation markers. Scope:\n  - OWNER / GENERAL_MANAGER / CALL_CENTER / CALL_CENTER_SUPERVISOR: full fleet.\n  - MANAGER: branch-scoped (`driver.branchId == JwtUser.branchId`).\nBranch scoping is enforced at the API layer; UI route guards are advisory.',
  })
  getDriverMonitoring(@CurrentUser() user: JwtUser) {
    const scopedBranchId =
      user.role === SafariRole.MANAGER ? user.branchId : null;
    return this.financeService.getDriverMonitoring(scopedBranchId);
  }

  @Patch('driver-monitoring/:driverId')
  @Roles(SafariRole.OWNER)
  @ApiOperation({
    summary: `Owner test hook — update driver map fields (${APP_BRAND})`,
    description:
      'OWNER only. Updates vehicleLabel and lastKnownLocation for map testing before live GPS integration.',
  })
  updateDriverTracking(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Body() dto: UpdateDriverTrackingDto,
  ) {
    return this.financeService.updateDriverTracking(driverId, dto);
  }

  @Post('handover/confirm')
  @Roles(SafariRole.MANAGER)
  @CashWriteEndpoint(SafariRole.MANAGER)
  @ApiOperation({
    summary: `Confirm cash handover (${APP_BRAND})`,
    description:
      'Atomic settlement: all PAID_TO_DRIVER orders for the driver → HANDED_OVER_TO_OFFICE; OPEN shift → CLOSED with ledger totals. Optional declaredHandoverTotal must match ledger within 0.0001 KWD. CashWritePoliceGuard rejects any request body containing forbidden cash-override fields (cashAmount, heldCashKd, totalCash, etc.) -- the ledger is the only producer.',
  })
  confirmHandover(
    @Body() dto: ConfirmHandoverDto,
    @CurrentUser() user: JwtUser,
  ): Promise<HandoverResultDto> {
    return this.financeService.confirmHandover(
      user.userId,
      user.role as SafariRole,
      dto,
    );
  }

  @Get('reports/financial-cycle')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({
    summary: `Owner financial cycle report (${APP_BRAND})`,
    description:
      'Read-only lifecycle: CASH order → collected by manager (handover) → verified by accountant (deposit verification).',
  })
  getFinancialCycleReport() {
    return this.financeService.getOwnerFinancialCycleReport();
  }

  @Get('reports/driver-cash-trace')
  @Permissions(AppPermission.VIEW_CASH)
  @ApiOperation({
    summary: `Driver cash trace report (${APP_BRAND})`,
    description:
      'V19.10 — trace each KD from driver collection through manager custody to verified bank deposit, for a given date window.',
  })
  getDriverCashTrace(
    @Query() query: DriverCashTraceQueryDto,
  ): Promise<DriverCashTraceResponseDto> {
    return this.financeService.getDriverCashTrace(query);
  }

  @Get('reports/cash-reconciliation')
  @Permissions(AppPermission.VIEW_CASH)
  @ApiOperation({
    summary: `Cash reconciliation snapshot (${APP_BRAND})`,
    description:
      'V19.31 — event-based totals in the selected window vs open balances now (drivers, managers by status).',
  })
  getCashReconciliation(
    @Query() query: CashReconciliationQueryDto,
  ): Promise<CashReconciliationSnapshotDto> {
    return this.financeService.getCashReconciliationSnapshot(query);
  }

  @Get('reports/unpaid-invoices')
  @Permissions(AppPermission.VIEW_DEBTS)
  @ApiOperation({
    summary: `Unpaid invoices list (${APP_BRAND})`,
    description:
      'Receivable on the customer per row, with `actorUser*` = field issuer (driver, branch manager, etc.). Ledger: `INVOICE_SHORTFALL` + subscription overuse + FIFO payments; plus `OPEN_UNPAITotal` lines. `kpis.totalMarketUnpaidKd` and `kpis.marketUnpaidByMethod` both use the full Σ `Order` UNPAID universe in branch scope (split by `posPaymentMethod` for the latter). Use `marketKpiBranchId` to align the headline with Call Center when `branchId` is omitted.',
  })
  getUnpaidInvoices(
    @Query() query: UnpaidInvoicesQueryDto,
  ): Promise<UnpaidInvoicesResponseDto> {
    return this.financeService.getUnpaidInvoices(query);
  }

  @Get('outstanding-debts-without-links')
  @Permissions(AppPermission.VIEW_DEBTS)
  @ApiOperation({
    summary: `Outstanding debts without active links (${APP_BRAND})`,
    description:
      'V25 — One row per customer with collectible open balance (UNPAID + PARTIAL) and no active hosted payment link on those invoices. Returns server-authoritative remaining totalDebt (KWD 3dp) and lastOrderDate for collections operations.',
  })
  getOutstandingDebtsWithoutLinks(
    @Query('branchId') branchId: string | undefined,
  ) {
    const raw = (branchId ?? '').trim();
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const scoped = raw && uuidRe.test(raw) ? raw : null;
    return this.financeService.getOutstandingDebtsWithoutLinks(scoped);
  }

  @Post('generate-settlement-link')
  @Permissions(AppPermission.VIEW_DEBTS)
  @ApiOperation({
    summary: `Generate one payment link for selected invoice balances (${APP_BRAND})`,
    description:
      'V25 — validates that invoiceIds belong to the customer and are still OPEN/UNPAID, re-calculates total on the server, creates one hosted settlement link, and persists settlement metadata for invoice fan-out on payment callback.',
  })
  generateSettlementLink(
    @Body() dto: GenerateSettlementLinkDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.financeService.generateSettlementLink(
      dto.customerId,
      dto.invoiceIds,
      user.userId,
    );
  }

  @Get('dashboard-summary')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.ACCOUNTANT)
  @Permissions(AppPermission.VIEW_FINANCIAL_REPORTS, AppPermission.VIEW_CASH)
  @ApiOperation({
    summary: `Accountant interactive dashboard (${APP_BRAND})`,
    description:
      'V19.32 — KPIs, cash pipeline, charts, drilldowns; cached ~45s when Redis is configured.',
  })
  getDashboardSummary(@Query() q: AccountantDashboardQueryDto) {
    return this.accountantDashboard.getDashboardSummary(q);
  }

  @Get('reconciliation/explain')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.ACCOUNTANT)
  @Permissions(AppPermission.VIEW_CASH)
  @ApiOperation({
    summary: `Reconciliation explain — timing lag breakdown (${APP_BRAND})`,
  })
  getReconciliationExplain(@Query() q: AccountantDashboardQueryDto) {
    return this.accountantDashboard.explainReconciliation(q);
  }

  @Get('reconciliation')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.ACCOUNTANT)
  @Permissions(AppPermission.VIEW_CASH)
  @ApiOperation({
    summary: `Cash reconciliation — collected vs handed (${APP_BRAND})`,
    description: 'Difference = handed − collected in window; badge for timing gaps.',
  })
  getFinanceReconciliation(@Query() q: AccountantDashboardQueryDto) {
    return this.accountantDashboard.getReconciliation(q);
  }

  @Get('alerts')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
    // V19.33 — Branch Manager dashboard alerts. Server clamps `branchId`
    // below to the JWT branch so a MANAGER can never read alerts for
    // another branch even by hand-crafting `?branchId=…`.
    SafariRole.MANAGER,
  )
  @Permissions(AppPermission.VIEW_CASH)
  @ApiOperation({ summary: `Finance alerts (${APP_BRAND})` })
  getFinanceAlerts(
    @Query() q: AccountantDashboardQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    if (user.role === SafariRole.MANAGER) {
      if (!user.branchId) {
        throw new ForbiddenException(
          'Manager has no branchId on JWT — cannot scope branch alerts.',
        );
      }
      q.branchId = user.branchId;
    }
    return this.accountantDashboard.getAlerts(q);
  }

  @Get('insights')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.ACCOUNTANT)
  @Permissions(AppPermission.VIEW_FINANCIAL_REPORTS, AppPermission.VIEW_CASH)
  @ApiOperation({ summary: `Rule-based finance insights (${APP_BRAND})` })
  getFinanceInsights(@Query() q: AccountantDashboardQueryDto) {
    return this.accountantDashboard.getInsights(q);
  }

  @Get('dashboard/realtime-totals')
  @Permissions(AppPermission.VIEW_CASH, AppPermission.VIEW_DEBTS)
  @ApiOperation({
    summary: `Realtime financial dashboard totals (${APP_BRAND})`,
    description:
      'Card totals for cash with drivers, online revenue, total debt, and subscription usage.',
  })
  getRealtimeTotals() {
    return this.financeService.getRealtimeTotals();
  }
}
