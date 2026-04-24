import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';

/**
 * V19.24 — Public POS invoice by signed JWT (WhatsApp share flow).
 * No auth header; token embeds `orderId` + `purpose: INVOICE_SHARE`.
 */
@ApiTags('public-invoice')
@Controller('public/invoice')
export class PublicInvoiceController {
  constructor(private readonly orders: OrdersService) {}

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
