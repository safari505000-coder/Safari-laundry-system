import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { InvoiceAuditService } from './invoice-audit.service';
import { EditInvoiceDto } from './dto/edit-invoice.dto';
import { VoidInvoiceDto } from './dto/void-invoice.dto';
import { ListAuditLogQueryDto } from './dto/list-audit-log.dto';
import { CcPerformanceQueryDto } from './dto/cc-performance.dto';

@ApiTags('invoice-audit')
@ApiBearerAuth('bearer')
@Controller('invoice-audit')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InvoiceAuditController {
  constructor(private readonly invoiceAudit: InvoiceAuditService) {}

  @Patch('orders/:orderId')
  @Roles(SafariRole.CALL_CENTER_SUPERVISOR, SafariRole.OWNER)
  @ApiOperation({
    summary: 'Same-day invoice edit by CC Supervisor',
    description:
      'V19.9 — Patch totalPrice / posPaymentMethod / notes on a non-canceled order that was issued on the same Kuwait-local day. Writes an immutable InvoiceAuditLog row and posts GL reversal + re-post entries so the books stay balanced.',
  })
  editInvoice(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: EditInvoiceDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.invoiceAudit.editInvoice(
      orderId,
      user.userId,
      user.role as SafariRole,
      dto,
    );
  }

  @Post('orders/:orderId/void')
  @Roles(SafariRole.CALL_CENTER_SUPERVISOR, SafariRole.OWNER)
  @ApiOperation({
    summary: 'Soft-void an invoice by CC Supervisor',
    description:
      'V19.9 — Flip order.status → CANCELED, reverse the GL sale entry with a negative POS_SALE_COMPLETED row, and roll back the wallet (refund subscription balance or clear the debt slot). Writes an immutable InvoiceAuditLog row with the mandatory reason.',
  })
  voidInvoice(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: VoidInvoiceDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.invoiceAudit.voidInvoice(
      orderId,
      user.userId,
      user.role as SafariRole,
      dto.reason,
    );
  }

  @Get('log')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
  )
  @ApiOperation({
    summary: 'Invoice audit log — edits and voids',
    description:
      'V19.9 — Owner / GM / Accountant paginated read of every supervisor edit and void with before/after snapshots, the actor, the mandatory void reason, and the financial impact in fils.',
  })
  listAuditLog(@Query() query: ListAuditLogQueryDto) {
    return this.invoiceAudit.listAuditLog(query);
  }

  @Get('cc-performance')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.CALL_CENTER_SUPERVISOR,
  )
  @ApiOperation({
    summary: 'Per-agent Call-Center performance',
    description:
      'V19.9 — For each CC agent (or supervisor) in the Kuwait-local date range: collections, debt settled, subscription activations, and distinct customers served. Defaults to today if `from`/`to` are omitted.',
  })
  ccPerformance(@Query() query: CcPerformanceQueryDto) {
    return this.invoiceAudit.getCcPerformance(query);
  }
}
