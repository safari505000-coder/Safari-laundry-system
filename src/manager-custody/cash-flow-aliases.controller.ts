/**
 * CashFlowAliasesController — clean-name path aliases for the
 * Driver→Manager→Bank cash flow.
 *
 * Mounts the brief's specified routes:
 *
 *   GET  /api/manager/cash-status            (PART 2 — operational snapshot)
 *   POST /api/driver/handover-cash           (PART 1 — alias of manager-custody/approve-receipt)
 *   POST /api/accountant/verify-deposit      (PART 4 — alias of manager-custody/:id/verify)
 *   POST /api/accountant/reject-custody      (PART 5 — alias of manager-custody/:id/reject)
 *   POST /api/bank-deposits/upload-slip      (PART 3 — alias of finance/bank-deposits)
 *
 * INTENT
 * ------
 * These are THIN ALIASES. They:
 *   - re-mount the same effects under the brief's preferred path stems
 *   - re-use the existing service methods (no duplicated business logic)
 *   - apply the same role gates as the canonical endpoints
 *   - emit the same audit events through the same code paths
 *
 * The original `/api/manager-custody/...` and `/api/finance/bank-deposits`
 * routes remain mounted for every existing frontend caller — nothing
 * is removed or rerouted.
 *
 * NOTE on the actor inversion in PART 1: the brief's name
 * `/api/driver/handover-cash` describes the cash-flow direction
 * (driver → manager), NOT the HTTP caller. The caller remains the
 * branch manager (Dastur §3 — manager-pulls-from-driver model);
 * inverting the actor would create an in-transit window where the
 * cash has no owner, which violates the brief's own "cash has ONE
 * owner only" core concept.
 *
 * NOTE on the role for PART 5: the brief's text says
 * "POST /api/manager/reject-custody" but the rejection authority is
 * the ACCOUNTANT, not the manager (a manager cannot reject their own
 * bag — that would be marking your own homework). The alias is
 * mounted at `/api/accountant/reject-custody` to match the verify
 * authority and PART 4's path stem.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
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
import { BankDepositType, SafariRole } from '@prisma/client';
import { diskStorage } from 'multer';
import type { Express } from 'express';
import { IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CashWriteEndpoint } from '../cash-monitor/cash-write-police.guard';
import { APP_BRAND } from '../common/constants/branding';
import { BankDepositsService } from '../finance/bank-deposits.service';
import { ApproveReceiptFromDriverDto } from './dto/approve-receipt-from-driver.dto';
import { RejectCustodyDto } from './dto/reject-custody.dto';
import { VerifyCustodyDto } from './dto/verify-custody.dto';
import { ManagerCustodyService } from './manager-custody.service';

const BANK_DEPOSITS_DIR = join(process.cwd(), 'uploads', 'bank-deposits');
const BANK_DEPOSIT_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

function parseDepositType(raw: string | undefined): BankDepositType {
  if (raw === 'CASH_DEPOSIT_SLIP' || raw === 'KNET_Z_REPORT') {
    return raw;
  }
  throw new BadRequestException(
    'depositType must be CASH_DEPOSIT_SLIP or KNET_Z_REPORT',
  );
}

class VerifyDepositAliasDto extends VerifyCustodyDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  custodyId!: string;
}

class RejectCustodyAliasDto extends RejectCustodyDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  custodyId!: string;
}

@ApiTags('cash-flow-aliases')
@ApiBearerAuth('bearer')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class CashFlowAliasesController {
  constructor(
    private readonly managerCustody: ManagerCustodyService,
    private readonly bankDeposits: BankDepositsService,
  ) {}

  // ───────────────────────────────────────────────── PART 2
  @Get('manager/cash-status')
  @Roles(SafariRole.MANAGER)
  @ApiOperation({
    summary: `Operational snapshot of cash held by the calling manager (${APP_BRAND})`,
    description:
      'STRICT operational view. Returns pendingDepositKd, bagsCount, lastHandoverAt only — no analytics, no totals beyond what the manager physically holds, no ledger access.',
  })
  getCashStatus(@CurrentUser() user: JwtUser) {
    return this.managerCustody.getCashStatusSnapshot(user.userId);
  }

  // ───────────────────────────────────────────────── PART 1 alias
  @Post('driver/handover-cash')
  @Roles(SafariRole.MANAGER)
  @CashWriteEndpoint(SafariRole.MANAGER)
  @ApiOperation({
    summary: `Driver → Manager cash handover (alias of manager-custody/approve-receipt) (${APP_BRAND})`,
    description:
      'Thin alias for the canonical handover endpoint. Caller is the branch MANAGER (Dastur §3 — manager-pulls-from-driver model). Atomic settlement via CashService.confirmHandover; creates a ManagerCashCustody bag in PENDING_DEPOSIT and emits CASH_HANDOVER_TRANSFER. The 24h aging clock starts now.',
  })
  handoverCash(
    @Body() dto: ApproveReceiptFromDriverDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.managerCustody.approveReceiptFromDriver(
      user.userId,
      user.branchId,
      dto,
    );
  }

  // ───────────────────────────────────────────────── PART 4 alias
  @Post('accountant/verify-deposit')
  @Roles(SafariRole.ACCOUNTANT)
  @CashWriteEndpoint(SafariRole.ACCOUNTANT)
  @ApiOperation({
    summary: `Accountant verifies a manager custody bag (alias of manager-custody/:id/verify) (${APP_BRAND})`,
    description:
      'Thin alias. Flips ManagerCashCustody → VERIFIED, emits CASH_DEPOSIT_VERIFIED, and the LedgerProjectionService will surface the DR BANK_ACCOUNT / CR MANAGER_<id> pair on the next /api/finance/ledger/* call.',
  })
  verifyDeposit(
    @Body() dto: VerifyDepositAliasDto,
    @CurrentUser() user: JwtUser,
  ) {
    const { custodyId, ...rest } = dto;
    return this.managerCustody.verifyCustody(custodyId, user.userId, rest);
  }

  // ───────────────────────────────────────────────── PART 5 alias
  @Post('accountant/reject-custody')
  @Roles(SafariRole.ACCOUNTANT)
  @CashWriteEndpoint(SafariRole.ACCOUNTANT)
  @ApiOperation({
    summary: `Accountant rejects a manager custody bag (alias of manager-custody/:id/reject) (${APP_BRAND})`,
    description:
      'Thin alias. Returns the bag to PENDING_DEPOSIT and emits CASH_HANDOVER_REJECTED. Mounted under /api/accountant/ rather than /api/manager/ because the rejection authority is the accountant — a manager cannot reject their own bag.',
  })
  rejectCustody(
    @Body() dto: RejectCustodyAliasDto,
    @CurrentUser() user: JwtUser,
  ) {
    const { custodyId, ...rest } = dto;
    return this.managerCustody.rejectCustody(custodyId, user.userId, rest);
  }

  // ───────────────────────────────────────────────── PART 3 alias
  @Post('bank-deposits/upload-slip')
  @Roles(SafariRole.MANAGER)
  @CashWriteEndpoint(SafariRole.MANAGER)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'depositType', 'amount'],
      properties: {
        file: { type: 'string', format: 'binary' },
        depositType: {
          type: 'string',
          enum: ['CASH_DEPOSIT_SLIP', 'KNET_Z_REPORT'],
        },
        amount: { type: 'string', example: '125.5000' },
        shiftId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiOperation({
    summary: `Upload bank deposit slip (alias of finance/bank-deposits) (${APP_BRAND})`,
    description:
      'Thin alias for the canonical upload. Same multipart contract, same coverage check (emits CASH_DEPOSIT_UNCOVERED with suspicious=true if declared amount exceeds held custody — never blocks the flow).',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          if (!existsSync(BANK_DEPOSITS_DIR)) {
            mkdirSync(BANK_DEPOSITS_DIR, { recursive: true });
          }
          cb(null, BANK_DEPOSITS_DIR);
        },
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase() || '.jpg';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (BANK_DEPOSIT_MIMES.has(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'Only JPEG, PNG, WebP, or PDF files are allowed',
            ),
            false,
          );
        }
      },
    }),
  )
  async uploadSlip(
    @UploadedFile() file: Express.Multer.File,
    @Body('depositType') depositTypeRaw: string,
    @Body('amount') amountRaw: string,
    @Body('shiftId') shiftId: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    if (!file?.filename) {
      throw new BadRequestException('Receipt file is required');
    }
    const depositType = parseDepositType(depositTypeRaw);
    const amount = Number.parseFloat(amountRaw ?? '');
    if (!Number.isFinite(amount)) {
      throw new BadRequestException('amount is required and must be a number');
    }
    const url = `/uploads/bank-deposits/${file.filename}`;
    return this.bankDeposits.createFromUpload(
      user.userId,
      url,
      depositType,
      amount,
      shiftId?.trim() || undefined,
      user.role,
    );
  }
}
