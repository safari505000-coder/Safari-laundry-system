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
import { BankDepositType, SafariRole } from '@prisma/client';
import { diskStorage } from 'multer';
import type { Express } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { CashWriteEndpoint } from '../cash-monitor/cash-write-police.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { BankDepositsService } from './bank-deposits.service';
import { BankDepositsListQueryDto } from './dto/bank-deposits-list-query.dto';

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

@ApiTags('finance')
@ApiBearerAuth('bearer')
@Controller('finance/bank-deposits')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BankDepositsController {
  constructor(private readonly bankDepositsService: BankDepositsService) {}

  @Get()
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.MANAGER,
  )
  @ApiOperation({
    summary: `Bank deposits log (${APP_BRAND})`,
    description:
      'OWNER: read-only monitoring. ACCOUNTANT: review list. MANAGER: see uploaded items.',
  })
  list(@Query() q: BankDepositsListQueryDto) {
    return this.bankDepositsService.list(q);
  }

  @Post()
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
    summary: `Upload cash slip or K-Net Z-report (${APP_BRAND})`,
    description: 'MANAGER only. JPEG, PNG, WebP, or PDF, max ~8MB.',
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
  async create(
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
    return this.bankDepositsService.createFromUpload(
      user.userId,
      url,
      depositType,
      amount,
      shiftId?.trim() || undefined,
      user.role,
    );
  }

  @Post(':id/verify')
  @Roles(SafariRole.ACCOUNTANT)
  @CashWriteEndpoint(SafariRole.ACCOUNTANT)
  @ApiOperation({
    summary: `Verify deposit matches records (${APP_BRAND})`,
    description:
      'ACCOUNTANT only -- dual control confirmation. CashWritePoliceGuard enforces the role lock and rejects any forbidden cash-override fields in the (currently empty) body.',
  })
  verify(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.bankDepositsService.verify(user.userId, id);
  }
}
