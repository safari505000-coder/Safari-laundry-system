import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
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
    if (!orderId || orderId.length < 32) {
      throw new BadRequestException('orderId query is required (UUID)');
    }
    const safe = JSON.stringify(orderId);
    const mockEnabled = this.paymentsService.isPublicMockCheckoutAvailable();
    const html = `<!DOCTYPE html>
<html lang="ar"><head><meta charset="utf-8"/><title>Safari Omni Payment</title>
<style>body{font-family:system-ui,sans-serif;max-width:28rem;margin:2rem auto;padding:1rem}
button{background:#1e3a5f;color:#fff;border:0;padding:.6rem 1rem;border-radius:.5rem;cursor:pointer;font-size:1rem}
p{color:#444;line-height:1.5}</style></head><body>
<h1>Safari Omni - Payment Link</h1>
<p>Reference: ${orderId}</p>
<p>This payment endpoint is always reachable to avoid 404 during testing and link verification.</p>
${mockEnabled ? '<p>Mock mode enabled. Click below to simulate a successful gateway callback.</p>' : '<p>Gateway mode is active. Mock callback is disabled by configuration.</p>'}
<button type="button" id="go">Simulate successful payment</button>
<pre id="out" style="margin-top:1rem;font-size:12px"></pre>
<script>
document.getElementById('go').onclick = async function () {
  const out = document.getElementById('out');
  ${mockEnabled ? '' : "out.textContent = 'Mock callback disabled. Set PAYMENTS_MOCK=true to simulate.'; return;"}
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

  @Get('mock/checkout')
  @ApiExcludeEndpoint()
  mockCheckoutPageAlias(
    @Query('orderId') orderId: string | undefined,
    @Res() res: Response,
  ): void {
    this.mockCheckoutPage(orderId, res);
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
