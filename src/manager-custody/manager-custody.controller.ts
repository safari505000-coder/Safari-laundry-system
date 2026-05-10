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
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { ApproveReceiptFromDriverDto } from './dto/approve-receipt-from-driver.dto';
import {
  ListCustodyQueryDto,
  StaffDebtsQueryDto,
} from './dto/list-custody-query.dto';
import { RejectCustodyDto } from './dto/reject-custody.dto';
import { UploadDepositSlipDto } from './dto/upload-deposit-slip.dto';
import { VerifyCustodyDto } from './dto/verify-custody.dto';
import { ManagerCustodyService } from './manager-custody.service';

const DEPOSIT_SLIPS_DIR = join(process.cwd(), 'uploads', 'deposit-slips');
const DEPOSIT_SLIP_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Dastur §3 — Manager Accountability (Director level).
 * RBAC:
 *   - approve-receipt / upload-slip / mine       → MANAGER
 *   - upload-slip-image (multipart)              → MANAGER
 *   - verify / reject / aging                    → ACCOUNTANT (OWNER bypasses globally)
 */
@ApiTags('manager-custody')
@ApiBearerAuth('bearer')
@Controller('manager-custody')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ManagerCustodyController {
  constructor(private readonly svc: ManagerCustodyService) {}

  // ------------------------------------------------------------- MANAGER ops
  @Post('approve-receipt')
  @Roles(SafariRole.MANAGER)
  @ApiOperation({
    summary: `Manager approves receipt of cash from driver (${APP_BRAND})`,
    description:
      'Atomic: closes open shift, flips CASH orders → HANDED_OVER_TO_OFFICE (driver balance = 0), opens a ManagerCashCustody bag in PENDING_DEPOSIT. The 24h aging clock starts now.',
  })
  approveReceipt(
    @Body() dto: ApproveReceiptFromDriverDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.svc.approveReceiptFromDriver(user.userId, user.branchId, dto);
  }

  @Post('upload-slip-image')
  @Roles(SafariRole.MANAGER)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: `Upload deposit slip image (${APP_BRAND})`,
    description:
      'JPEG/PNG/WebP, max ~1MB per Dastur §1. Returns depositSlipUrl for POST /manager-custody/:id/upload-slip.',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          if (!existsSync(DEPOSIT_SLIPS_DIR)) {
            mkdirSync(DEPOSIT_SLIPS_DIR, { recursive: true });
          }
          cb(null, DEPOSIT_SLIPS_DIR);
        },
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase() || '.jpg';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      // Dastur §1: JSON body is 1 MB; image upload is multipart so we keep
      // headroom up to ~6 MB matching existing handover-receipt slot.
      limits: { fileSize: 6 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (DEPOSIT_SLIP_MIMES.has(file.mimetype)) {
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
  uploadSlipImage(@UploadedFile() file: Express.Multer.File) {
    if (!file?.filename) {
      throw new BadRequestException('Deposit slip image is required');
    }
    return { depositSlipUrl: `/uploads/deposit-slips/${file.filename}` };
  }

  @Post(':id/upload-slip')
  @Roles(SafariRole.MANAGER)
  @ApiOperation({
    summary: `Attach deposit slip to a pending custody bag (${APP_BRAND})`,
  })
  uploadSlip(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UploadDepositSlipDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.svc.uploadDepositSlip(id, user.userId, dto);
  }

  @Get('mine')
  @Roles(
    SafariRole.MANAGER,
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
  )
  @ApiOperation({ summary: `Manager custody bags — branch "mine" or fleet read-only (${APP_BRAND})` })
  listMine(@CurrentUser() user: JwtUser) {
    return this.svc.listMineForActor(
      user.userId,
      user.role as SafariRole,
    );
  }

  // -------------------------------------------------- DRIVER self-service ops
  /**
   * V19.17 — Driver self-service list of formal cash handover
   * receipts. Each row maps 1:1 with a ManagerCashCustody bag that
   * the driver handed over to a branch manager and can be opened as
   * a printable voucher (سند استلام رسمي) from the driver's sidebar.
   */
  @Get('driver/mine')
  @Roles(SafariRole.DRIVER)
  @ApiOperation({
    summary: `Driver — my cash-handover receipts (${APP_BRAND})`,
    description:
      'Returns every handover the driver performed to a branch manager, regardless of the deposit status on the manager side. The driver opens each row as a formal A4 voucher from /my-cash-receipts/:id/print.',
  })
  listDriverMine(@CurrentUser() user: JwtUser) {
    return this.svc.listByDriver(user.userId);
  }

  // --------------------------------------------------------- ACCOUNTANT ops
  @Post(':id/verify')
  @Roles(SafariRole.ACCOUNTANT)
  @ApiOperation({
    summary: `Accountant verifies deposit slip (${APP_BRAND})`,
    description:
      'Only bags in AWAITING_VERIFICATION can be verified. OWNER bypasses globally.',
  })
  verify(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyCustodyDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.svc.verifyCustody(id, user.userId, dto);
  }

  @Post(':id/reject')
  @Roles(SafariRole.ACCOUNTANT)
  @ApiOperation({ summary: `Accountant rejects deposit slip (${APP_BRAND})` })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectCustodyDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.svc.rejectCustody(id, user.userId, dto);
  }

  // ---------------------------------------------------------- OWNER reports
  @Get('aging')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.ACCOUNTANT)
  @ApiOperation({
    summary: `Cash Held by Managers — aging report (${APP_BRAND})`,
    description:
      'Dastur §3: rows older than 24h without VERIFIED status are flagged as overdue (red in UI).',
  })
  aging(@Query() q: ListCustodyQueryDto) {
    return this.svc.listAging(q);
  }

  @Get('staff-debts')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.ACCOUNTANT)
  @ApiOperation({
    summary: `Staff debts canonical readonly projection (${APP_BRAND})`,
    description:
      'V21 Phase 2: combined filter-aware projection for driver balances + manager custody aging. Rows and totals are computed from the same filtered dataset.',
  })
  staffDebts(@Query() q: StaffDebtsQueryDto) {
    return this.svc.getStaffDebtsProjection(q);
  }

  /**
   * V19.17 — single receipt fetch for the printable voucher.
   *
   * IMPORTANT: this route uses a bare `:id` segment and must stay LAST
   * in the file. NestJS matches `@Get()` handlers in declaration order,
   * so if `:id` is defined before `mine` / `driver/mine` / `aging`,
   * any request to those static paths gets swallowed by `:id` and
   * rejected by `ParseUUIDPipe` as "uuid is expected".
   *
   * Access control is enforced inside the service (driver-self,
   * manager-self, or privileged back-office roles only).
   */
  @Get(':id')
  @Roles(
    SafariRole.DRIVER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.GENERAL_MANAGER,
    SafariRole.OWNER,
  )
  @ApiOperation({
    summary: `Single cash-handover receipt (${APP_BRAND})`,
    description:
      'Backs the printable voucher page. The driver who handed over, the manager who received, and the back-office audit roles (Accountant / GM / Owner) are the only principals allowed through.',
  })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.svc.findByIdForReceipt(
      id,
      user.userId,
      user.role as SafariRole,
    );
  }
}
