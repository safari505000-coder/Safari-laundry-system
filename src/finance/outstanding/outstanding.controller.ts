import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import type { Response } from 'express';
import {
  CurrentUser,
  type JwtUser,
} from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { OutstandingExportService } from './outstanding-export.service';
import { OutstandingQueryDto } from './dto/outstanding-query.dto';
import {
  CustomerCollectionStatusDto,
  UpdateCustomerCollectionStatusDto,
} from './dto/update-customer-collection-status.dto';
import { OutstandingResponseDto } from './dto/outstanding-row.dto';
import { OutstandingService } from './outstanding.service';

const READ_ROLES = [
  SafariRole.OWNER,
  SafariRole.GENERAL_MANAGER,
  SafariRole.ACCOUNTANT,
  SafariRole.CALL_CENTER,
  SafariRole.CALL_CENTER_SUPERVISOR,
] as const;

const MUTATE_ROLES = [
  SafariRole.CALL_CENTER,
  SafariRole.CALL_CENTER_SUPERVISOR,
  SafariRole.OWNER,
] as const;

/**
 * V19.x — Outstanding-Payments REST surface (Accounts-Receivable).
 * Routes are registered without an explicit `/api` prefix because the
 * Nest app is bootstrapped with `setGlobalPrefix('api')`.
 */
@ApiTags('finance.outstanding')
@ApiBearerAuth('bearer')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class OutstandingController {
  constructor(
    private readonly outstanding: OutstandingService,
    private readonly exporter: OutstandingExportService,
  ) {}

  @Get('finance/outstanding')
  @Roles(...READ_ROLES)
  @ApiOperation({
    summary: 'List outstanding customers',
    description:
      'Aggregates Collections-scope receivable orders per customer (same predicate as the red «market debt» KPI: UNPAID + open FIFO debt-on-account, excluding canceled). Headline totalDueKd matches that KPI when no narrowing filters are set. Optional `from`/`to` bound Order.createdAt.',
  })
  list(
    @Query() query: OutstandingQueryDto,
    @CurrentUser() user: JwtUser | undefined,
  ): Promise<OutstandingResponseDto> {
    return this.outstanding.listOutstanding(query, user);
  }

  @Post('finance/outstanding/export')
  @Roles(...READ_ROLES)
  @ApiOperation({
    summary: 'Export the current outstanding view as Excel',
    description:
      'Mirrors the same filters as `GET /api/finance/outstanding` and streams an xlsx workbook back. Body and query are merged so the front-end can call POST with a JSON snapshot of the filter bar.',
  })
  async export(
    @Body() body: OutstandingQueryDto,
    @Query() query: OutstandingQueryDto,
    @CurrentUser() user: JwtUser | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const merged: OutstandingQueryDto = { ...query, ...body };
    const { stream, filename } = await this.exporter.toXlsx(merged, user);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    return new StreamableFile(stream);
  }

  @Get('finance/customer/:id/status')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Read the AR collection status row for a customer' })
  getStatus(
    @Param('id', new ParseUUIDPipe()) customerId: string,
  ): Promise<CustomerCollectionStatusDto> {
    return this.outstanding.getCollectionStatus(customerId);
  }

  @Patch('finance/customer/:id/status')
  @Roles(...MUTATE_ROLES)
  @ApiOperation({
    summary: 'Update collection status / manual block toggle',
    description:
      'Manual operator action. Writes a `CUSTOMER_COLLECTION_UPDATED` audit row and (when applicable) a paired CUSTOMER_BLOCKED / CUSTOMER_UNBLOCKED financial event. Never invoked from automation.',
  })
  async patchStatus(
    @Param('id', new ParseUUIDPipe()) customerId: string,
    @Body() body: UpdateCustomerCollectionStatusDto,
    @CurrentUser() user: JwtUser | undefined,
  ): Promise<CustomerCollectionStatusDto> {
    if (!user) {
      throw new ForbiddenException('CUSTOMER_COLLECTION_STATUS_FORBIDDEN');
    }
    return this.outstanding.updateCollectionStatus({
      customerId,
      body,
      actorUserId: user.userId ?? null,
      actorRole: user.role ?? null,
    });
  }
}
