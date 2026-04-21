import { existsSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import {
  BadRequestException,
  Body,
  Controller,
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { ConfirmHandoverDto } from './dto/confirm-handover.dto';
import { DebtByCategoryQueryDto } from './dto/debt-by-category-query.dto';
import { DailyPosSalesQueryDto } from './dto/daily-pos-sales-query.dto';
import {
  DriverBalanceResponseDto,
  HandoverResultDto,
} from './dto/driver-balance.dto';
import {
  DriverCashTraceQueryDto,
  DriverCashTraceResponseDto,
} from './dto/driver-cash-trace.dto';
import { OwnerCustomerWalletSummaryDto } from './dto/owner-customer-wallet-summary.dto';
import { UpdateDriverTrackingDto } from './dto/update-driver-tracking.dto';
import { FinanceService } from './finance.service';

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
  constructor(private readonly financeService: FinanceService) {}

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

  @Get('consolidated-cash')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.ACCOUNTANT)
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
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.SUPERVISOR,
  )
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
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
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

  @Get('driver-monitoring')
  @Roles(SafariRole.OWNER)
  @ApiOperation({
    summary: `Driver monitoring map feed (${APP_BRAND})`,
    description:
      'OWNER only. Safari Pulse map feed of active ON_SHIFT drivers with lastKnownLocation markers. Locked to OWNER at the API layer regardless of UI route guards.',
  })
  getDriverMonitoring() {
    return this.financeService.getDriverMonitoring();
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
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
  )
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

  @Get('dashboard/realtime-totals')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.SUPERVISOR,
    SafariRole.VIEWER,
  )
  @ApiOperation({
    summary: `Realtime financial dashboard totals (${APP_BRAND})`,
    description:
      'Card totals for cash with drivers, online revenue, total debt, and subscription usage.',
  })
  getRealtimeTotals() {
    return this.financeService.getRealtimeTotals();
  }
}
