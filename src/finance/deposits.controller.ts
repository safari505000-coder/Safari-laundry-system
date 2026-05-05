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
import { DepositType, SafariRole } from '@prisma/client';
import { diskStorage } from 'multer';
import type { Express } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type JwtUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { DepositsListQueryDto } from './dto/deposits-list-query.dto';
import { UpdateDepositStatusDto } from './dto/update-deposit-status.dto';
import { DepositsService } from './deposits.service';

const DEPOSITS_DIR = join(process.cwd(), 'uploads', 'deposits');
const DEPOSIT_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

function parseDepositType(raw: string | undefined): DepositType {
  if (raw === 'CASH' || raw === 'KNET') return raw;
  throw new BadRequestException('type must be CASH or KNET');
}

@ApiTags('finance')
@ApiBearerAuth('bearer')
@Controller('finance/deposits')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DepositsController {
  constructor(private readonly depositsService: DepositsService) {}

  @Get()
  @Roles(
    SafariRole.DRIVER,
    SafariRole.ACCOUNTANT,
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
  )
  @ApiOperation({
    summary: `Deposits audit queue (${APP_BRAND})`,
    description:
      'DRIVER sees own requests. ACCOUNTANT/OWNER can filter by status and driver.',
  })
  list(@CurrentUser() user: JwtUser, @Query() q: DepositsListQueryDto) {
    return this.depositsService.listForUser(user.userId, user.role, q);
  }

  @Post()
  @Roles(SafariRole.DRIVER)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'amount', 'type'],
      properties: {
        file: { type: 'string', format: 'binary' },
        amount: { type: 'string', example: '25.7500' },
        type: { type: 'string', enum: ['CASH', 'KNET'] },
      },
    },
  })
  @ApiOperation({
    summary: `Driver submits deposit request (${APP_BRAND})`,
    description: 'Creates a PENDING deposit request with receipt image/pdf.',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          if (!existsSync(DEPOSITS_DIR)) {
            mkdirSync(DEPOSITS_DIR, { recursive: true });
          }
          cb(null, DEPOSITS_DIR);
        },
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase() || '.jpg';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (DEPOSIT_MIMES.has(file.mimetype)) cb(null, true);
        else {
          cb(
            new BadRequestException('Only JPEG, PNG, WebP, or PDF are allowed'),
            false,
          );
        }
      },
    }),
  )
  create(
    @CurrentUser() user: JwtUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('amount') amountRaw: string,
    @Body('type') typeRaw: string,
  ) {
    if (!file?.filename) {
      throw new BadRequestException('Receipt file is required');
    }
    const amount = Number.parseFloat(amountRaw ?? '');
    if (!Number.isFinite(amount)) {
      throw new BadRequestException('amount must be a number');
    }
    const type = parseDepositType(typeRaw);
    const url = `/uploads/deposits/${file.filename}`;
    return this.depositsService.createByDriver(user.userId, amount, type, url);
  }

  @Patch(':id/status')
  @Roles(SafariRole.ACCOUNTANT, SafariRole.OWNER)
  @ApiOperation({
    summary: `Accountant/Owner audits deposit (${APP_BRAND})`,
    description:
      'APPROVED triggers liability reduction via DebtService and updates wallet cash/bank balance.',
  })
  updateStatus(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDepositStatusDto,
  ) {
    return this.depositsService.updateStatus(
      user.userId,
      user.role as SafariRole,
      id,
      dto,
    );
  }
}

