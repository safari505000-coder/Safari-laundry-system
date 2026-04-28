import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Param,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { OrdersService } from './orders.service';

/**
 * V19.24 — Public POS invoice by signed JWT (WhatsApp share flow).
 * No auth header; token embeds `orderId` + `purpose: INVOICE_SHARE`.
 */
@ApiTags('public-invoice')
@Controller('public/invoice')
export class PublicInvoiceController {
  constructor(private readonly orders: OrdersService) {}

  /**
   * V19.27.2 — Query form preferred for long JWTs; some gateways mangle path segments.
   * GET /api/public/invoice/pdf?token=...
   */
  @Get('pdf')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  @Header('Pragma', 'no-cache')
  @ApiProduces('application/pdf')
  @ApiOperation({
    summary: 'Download invoice PDF (token in query string)',
    description:
      'Same JWT as `GET /:token` / `GET pdf/:token`. Use when the token is long or path-based URLs are altered by a proxy.',
  })
  async getPdfByQuery(
    @Query('token') token: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (token == null || !String(token).trim()) {
      throw new BadRequestException('Missing required query: token');
    }
    return this.servePublicInvoicePdf(String(token), res);
  }

  @Get('pdf/:token')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  @Header('Pragma', 'no-cache')
  @ApiProduces('application/pdf')
  @ApiOperation({
    summary: 'Download shared invoice as PDF (token in path)',
    description:
      'V19.27 — Same JWT as `GET /:token` but returns `application/pdf` for Moatmt `media_url` fetches.',
  })
  async getPdfByParam(
    @Param('token') token: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.servePublicInvoicePdf(token, res);
  }

  private async servePublicInvoicePdf(token: string, res: Response) {
    const { stream, filename } = await this.orders.getPublicInvoicePdfStream(token);
    // V1.7.2 — set headers explicitly via the raw Express response so the
    // browser always treats the body as a binary download. `attachment`
    // (instead of `inline`) makes the luxury success page's «تحميل الفاتورة»
    // button save the PDF to disk rather than rendering it (or, worse,
    // showing the escaped JSON wrapper — see Bug A-49).
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    return new StreamableFile(stream, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
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
