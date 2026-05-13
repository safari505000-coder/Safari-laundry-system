import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { InvoicePaymentStatusService } from './invoice-payment-status.service';

/**
 * V20.3.1 — Partial-payment correctness API.
 *
 * Mounted at `/api/finance/invoices/...` (the global Nest prefix is
 * `api`). Read-only and lightweight — meant for the call-center
 * Outstanding panel and the customer 360 panel to render the new
 * `{totalAmount, paidAmount, remainingAmount, status,
 * isPartiallyPaid, isFullyPaid}` shape without recomputing the
 * waterfall on the client.
 */
const INVOICE_STATUS_READ_ROLES = [
  SafariRole.OWNER,
  SafariRole.GENERAL_MANAGER,
  SafariRole.ACCOUNTANT,
  SafariRole.CALL_CENTER_SUPERVISOR,
  SafariRole.CALL_CENTER,
] as const;

/**
 * متحكم حالة دفع الفاتورة — نقطة نهاية الرصيد المتبقي الكانوني
 * Invoice payment status REST controller providing the canonical remaining-balance computation.
 * Read-only. Mounted at `/api/finance/invoices/*`.
 * @since V20.3.1
 */
@ApiTags('finance.invoices')
@ApiBearerAuth('bearer')
@Controller('finance/invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InvoicePaymentStatusController {
  constructor(private readonly service: InvoicePaymentStatusService) {}

  @Get(':orderId/payment-status')
  @Roles(...INVOICE_STATUS_READ_ROLES)
  @ApiParam({ name: 'orderId', required: true })
  @ApiOperation({
    summary:
      'V20.3.1 — canonical payment status for an invoice/order ' +
      '(remaining = totalPrice − payments − wallet absorption)',
  })
  /**
   * يُرجع حالة دفع الفاتورة مع الرصيد المتبقي الكانوني
   * Returns the canonical payment status for an invoice/order.
   */
  async getPaymentStatus(@Param('orderId') orderId: string) {
    if (!orderId || orderId.trim().length === 0) {
      throw new BadRequestException('orderId required');
    }
    return this.service.derivePaymentStatus(orderId.trim());
  }

  @Get('payment-status')
  @Roles(...INVOICE_STATUS_READ_ROLES)
  @ApiOperation({
    summary:
      'V20.3.1 — batch payment status. ' +
      'Pass `?ids=<orderId>,<orderId>` (max 100). Returns one row per id.',
  })
  async getPaymentStatusBatch(@Query('ids') idsRaw?: string) {
    if (!idsRaw) return { rows: [] };
    const ids = idsRaw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (ids.length === 0) return { rows: [] };
    if (ids.length > 100) {
      throw new BadRequestException('At most 100 ids per batch');
    }
    const rows = await Promise.all(
      ids.map((id) => this.service.derivePaymentStatus(id)),
    );
    return { rows };
  }
}
