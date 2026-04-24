import { Controller, Get, Param, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';

/**
 * V19.24 — Public POS invoice by signed JWT (WhatsApp share flow).
 * No auth header; token embeds `orderId` + `purpose: INVOICE_SHARE`.
 */
@ApiTags('public-invoice')
@Controller('public/invoice')
export class PublicInvoiceController {
  constructor(private readonly orders: OrdersService) {}

  @Get('pdf/:token')
  @ApiProduces('application/pdf')
  @ApiOperation({
    summary: 'Download shared invoice as PDF (direct binary for WhatsApp media)',
    description:
      'V19.27 — Same JWT as `GET /:token` but returns `application/pdf` for Moatmt `media_url` fetches. Must be listed before the generic `:token` route.',
  })
  async getPdf(@Param('token') token: string) {
    const { stream, filename } = await this.orders.getPublicInvoicePdfStream(token);
    return new StreamableFile(stream, {
      type: 'application/pdf',
      disposition: `inline; filename="${filename}"`,
    });
  }

  @Get(':token')
  @ApiOperation({
    summary: 'Load a shared invoice receipt for customer PDF save',
    description:
      'Validates the JWT, returns the same order detail shape as GET /api/orders/:id for receipt rendering.',
  })
  get(@Param('token') token: string) {
    return this.orders.getOrderForPublicInvoiceToken(token);
  }
}
