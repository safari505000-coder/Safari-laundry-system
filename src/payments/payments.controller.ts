import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PaymentsService } from '../common/services/payments.service';
import { PaymentCallbackDto } from './dto/payment-callback.dto';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Local / mock: browser page to simulate gateway success (POSTs to callback with devMock).
   */
  @Get('mock-checkout')
  @ApiExcludeEndpoint()
  mockCheckoutPage(
    @Query('orderId') orderId: string | undefined,
    @Res() res: Response,
  ): void {
    if (!this.paymentsService.isPublicMockCheckoutAvailable()) {
      throw new NotFoundException();
    }
    if (!orderId || orderId.length < 32) {
      throw new BadRequestException('orderId query is required (UUID)');
    }
    const safe = JSON.stringify(orderId);
    const html = `<!DOCTYPE html>
<html lang="ar"><head><meta charset="utf-8"/><title>Mock payment</title>
<style>body{font-family:system-ui,sans-serif;max-width:28rem;margin:2rem auto;padding:1rem}
button{background:#1e3a5f;color:#fff;border:0;padding:.6rem 1rem;border-radius:.5rem;cursor:pointer;font-size:1rem}
p{color:#444;line-height:1.5}</style></head><body>
<h1>Mock payment (dev)</h1>
<p>Reference: ${orderId}</p>
<p>This page is shown when <code>PAYMENTS_MOCK</code> is set or <code>PAYMENTS_API_BASE_URL</code> is empty. Click below to simulate a successful gateway callback.</p>
<button type="button" id="go">Simulate successful payment</button>
<pre id="out" style="margin-top:1rem;font-size:12px"></pre>
<script>
document.getElementById('go').onclick = async function () {
  const out = document.getElementById('out');
  try {
    const r = await fetch('/api/payments/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: ${safe}, status: 'success', devMock: true }),
    });
    const t = await r.text();
    out.textContent = r.ok ? 'OK: ' + t : 'HTTP ' + r.status + ' ' + t;
  } catch (e) {
    out.textContent = String(e);
  }
};
</script>
</body></html>`;
    res.type('html').send(html);
  }

  /**
   * Public webhook — gateway posts payment result (no JWT).
   * Secured via PAYMENTS_SECRET signature on the payload.
   */
  @Post('callback')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Kuwait Gateway payment callback',
    description:
      'Expects JSON with orderId, status, optional amount, and signature. On success, completes the order and runs wallet settlement.',
  })
  async callback(@Body() body: PaymentCallbackDto) {
    if (
      !this.paymentsService.allowDevMockCallback(body) &&
      !this.paymentsService.verifyIntegratedCallback(body)
    ) {
      throw new UnauthorizedException(
        'Invalid or missing payment callback signature',
      );
    }

    const outcome = this.paymentsService.normalizeCallbackStatus(body.status);
    if (outcome === 'success') {
      await this.paymentsService.finalizePaidOrderFromGateway(body.orderId);
    }

    return { ok: true as const, orderId: body.orderId, outcome };
  }
}
