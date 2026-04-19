import {
  Controller,
  Get,
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
import type { Response } from 'express';
import { SafariRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ListAttendanceQueryDto } from '../attendance/dto/list-attendance-query.dto';
import { InventoryReportQueryDto } from '../inventory/dto/inventory-report-query.dto';
import { ListMovementsQueryDto } from '../inventory/dto/list-movements-query.dto';
import { ExportsService } from './exports.service';

/**
 * Stage-B — server-side export endpoints.
 *
 * Each route streams a generated file (XLSX or PDF) with the proper
 * `Content-Disposition` so the browser saves it with a meaningful
 * filename instead of dumping bytes into the page. Role gating is
 * inherited from the underlying services: attendance view is
 * restricted, payroll list checks for OWNER/GM/MANAGER/ACC, the
 * reports service guards branch access, etc.
 */
@ApiTags('exports')
@ApiBearerAuth('bearer')
@Controller('exports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Get('issued-invoices.xlsx')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.MANAGER,
  )
  @ApiOperation({
    summary: 'Export issued invoices as Excel',
    description:
      'Streams an .xlsx workbook with the same filter contract as `GET /api/reports/issued-invoices`. RTL layout, brand header, grand total row.',
  })
  async issuedInvoicesXlsx(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('driverId') driverId: string | undefined,
    @Query('branchId') branchId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { stream, filename } = await this.exports.issuedInvoicesXlsx(
      from,
      to,
      driverId,
      branchId,
    );
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

  @Get('issued-invoices.pdf')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.MANAGER,
  )
  @ApiOperation({
    summary: 'Export issued invoices as PDF',
    description:
      'Streams a one-shot PDF with the invoice list — useful for email attachments or headless cron.',
  })
  async issuedInvoicesPdf(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('driverId') driverId: string | undefined,
    @Query('branchId') branchId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { stream, filename } = await this.exports.issuedInvoicesPdf(
      from,
      to,
      driverId,
      branchId,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    return new StreamableFile(stream);
  }

  @Get('unified-ledger.xlsx')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Export the unified ledger stream as Excel' })
  async unifiedLedgerXlsx(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('driverId') driverId: string | undefined,
    @Query('branchId') branchId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { stream, filename } = await this.exports.unifiedLedgerXlsx(
      from,
      to,
      driverId,
      branchId,
    );
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

  @Get('attendance.xlsx')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.MANAGER,
  )
  @ApiOperation({ summary: 'Export attendance log as Excel' })
  async attendanceXlsx(
    @Query() q: ListAttendanceQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { stream, filename } = await this.exports.attendanceXlsx(q);
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

  @Get('payroll.xlsx')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.MANAGER,
  )
  @ApiOperation({ summary: 'Export payroll period as Excel' })
  async payrollXlsx(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('branchId') branchId: string | undefined,
    @CurrentUser() user: JwtUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { stream, filename } = await this.exports.payrollXlsx(
      user.role as SafariRole,
      from,
      to,
      branchId,
    );
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

  @Get('inventory.xlsx')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Export the smart inventory report as Excel' })
  async inventoryReportXlsx(
    @Query() q: InventoryReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { stream, filename } = await this.exports.inventoryReportXlsx(q);
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

  @Get('stock-movements.xlsx')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Export stock movements audit as Excel' })
  async stockMovementsXlsx(
    @Query() q: ListMovementsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { stream, filename } = await this.exports.stockMovementsXlsx(q);
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

  @Get('financial-cycle.xlsx')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({ summary: 'Export the daily financial cycle as Excel' })
  async financialCycleXlsx(
    @Query('date') date: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { stream, filename } = await this.exports.financialCycleXlsx(date);
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
}
