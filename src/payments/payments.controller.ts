import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiExcludeEndpoint,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../common/services/payments.service';
import { PaymentCallbackDto } from './dto/payment-callback.dto';

/**
 * V1.7.0 — Public DTO returned by `GET /api/payments/status/:orderId`.
 * Exposed ONLY to the customer-facing /payment/success & /payment/failed
 * pages so they can poll for settlement confirmation without needing a
 * logged-in session.
 */
class PublicOrderStatusDto {
  @ApiProperty() orderId!: string;
  @ApiProperty({
    enum: [
      'PENDING',
      'PICKED_UP',
      'IN_PROGRESS',
      'OUT_FOR_DELIVERY',
      'COMPLETED',
      'CANCELED',
    ],
  })
  status!: OrderStatus;
  @ApiProperty({ description: 'True once the gateway callback has settled the order.' })
  isPaid!: boolean;
  @ApiProperty({ description: 'Amount in KWD, 3 decimals, as a string.' })
  amountKd!: string;
}

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly prisma: PrismaService,
  ) {}

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
   * V1.7.0 — Public webhook (UPayments `notificationUrl`).
   *
   * UPayments does not sign webhooks the way the legacy HMAC
   * contract expected, so we NEVER trust the body blindly:
   *
   *   1. If `devMock` is set AND mock mode is enabled, take the
   *      legacy `{orderId, status}` pair and finalize — used by
   *      local dev + the mock-checkout HTML page only.
   *   2. Otherwise, pull `trackId` from the body (snake/upper/camel
   *      variants all handled) and call UPayments'
   *      `GET /api/v1/get-payment-status/{trackId}` with our
   *      server-side API key. Only if UPayments confirms
   *      `result === CAPTURED` (or equivalent) do we finalize.
   *   3. If the legacy HMAC `signature` field IS present AND we're
   *      not in mock mode, we still verify it as a fallback (for
   *      gateways that continue to use that contract).
   *
   * Always returns 200 so the gateway doesn't retry indefinitely
   * on legitimate "not paid yet" webhooks; the `outcome` field
   * carries the real result.
   */
  @Post('callback')
  @HttpCode(200)
  @ApiOperation({
    summary: 'UPayments payment notification webhook',
    description:
      'Server-side verification via `GET /api/v1/get-payment-status/{trackId}`. Legacy HMAC signatures and devMock are also accepted for non-UPayments gateways and local testing.',
  })
  async callback(@Body() body: PaymentCallbackDto) {
    // --- Mock / dev-only short-circuit ---
    if (this.paymentsService.allowDevMockCallback(body)) {
      const orderId = body.orderId ?? extractOrderId(body);
      if (!orderId) {
        throw new BadRequestException(
          'devMock callback requires an orderId (or customerExtraData=orderId=<uuid>)',
        );
      }
      const outcome = this.paymentsService.normalizeCallbackStatus(
        body.status ?? body.result ?? 'success',
      );
      if (outcome === 'success') {
        await this.paymentsService.finalizePaidOrderFromGateway(
          orderId,
          { devMock: true, receivedBody: body } as never,
        );
      }
      return { ok: true as const, orderId, outcome };
    }

    // --- Production path: UPayments inquiry ---
    const trackId =
      body.trackId?.trim() ||
      body.TrackID?.trim() ||
      body.gatewayReference?.trim() ||
      '';

    if (trackId) {
      this.logger.log(
        `UPayments callback: received trackId prefix=${trackId.slice(0, 12)}… (inquiry next)`,
      );
      const inquiry = await this.paymentsService.fetchGatewayStatus(trackId);
      const resolvedOrderId =
        inquiry.data.order?.id ??
        extractOrderIdFromExtraData(inquiry.data.customerExtraData) ??
        (await this.paymentsService.findOrderByTrackId(trackId)) ??
        extractOrderId(body) ??
        body.orderId ??
        null;

      if (!resolvedOrderId) {
        this.logger.warn(
          `UPayments webhook for trackId=${trackId} — cannot map to a Safari order; body=${safeJson(body)}`,
        );
        return {
          ok: false as const,
          outcome: 'failed' as const,
          reason: 'order-not-found',
        };
      }

      const outcome = this.paymentsService.normalizeCallbackStatus(
        inquiry.data.result ?? body.result ?? body.status ?? '',
      );
      const willFinalize = outcome === 'success' && inquiry.ok;
      this.logger.log(
        `UPayments callback: orderId=${resolvedOrderId} gatewayResult=${inquiry.data.result ?? 'n/a'} normalizedOutcome=${outcome} inquiryOk=${inquiry.ok} willFinalize=${willFinalize}`,
      );

      if (willFinalize) {
        await this.paymentsService.finalizePaidOrderFromGateway(
          resolvedOrderId,
          {
            provider: 'upayments',
            trackId,
            paymentId: inquiry.data.paymentId ?? body.paymentId ?? null,
            tranId: inquiry.data.transactionId ?? body.tranId ?? null,
            result: inquiry.data.result ?? body.result ?? null,
            auth: body.auth ?? null,
            amount: String(inquiry.data.amount ?? body.amount ?? ''),
            inquiryRaw: inquiry.raw,
            receivedBody: body,
          } as never,
        );
        this.logger.log(
          `UPayments callback: finalizePaidOrderFromGateway done orderId=${resolvedOrderId}`,
        );
      }

      return {
        ok: true as const,
        orderId: resolvedOrderId,
        trackId,
        outcome,
      };
    }

    // --- Legacy fallback: HMAC-signed webhook (non-UPayments gateway) ---
    this.logger.warn(
      `UPayments callback: no trackId in body — keys=${Object.keys(body ?? {}).join(',') || 'empty'}; falling back to legacy HMAC (needs orderId)`,
    );
    if (!body.orderId) {
      throw new UnauthorizedException(
        'Callback missing trackId and orderId — cannot verify payment',
      );
    }
    if (
      !this.paymentsService.verifyIntegratedCallback({
        orderId: body.orderId,
        status: body.status ?? body.result ?? '',
        amount: body.amount,
        signature: body.signature,
      })
    ) {
      throw new UnauthorizedException(
        'Invalid or missing payment callback signature',
      );
    }
    const outcome = this.paymentsService.normalizeCallbackStatus(
      body.status ?? body.result ?? '',
    );
    if (outcome === 'success') {
      await this.paymentsService.finalizePaidOrderFromGateway(
        body.orderId,
        { provider: 'legacy-hmac', receivedBody: body } as never,
      );
    }
    return { ok: true as const, orderId: body.orderId, outcome };
  }

  /**
   * V1.7.0 — Public status poll for the customer-facing
   * /payment/success and /payment/failed pages. No auth — the
   * customer holding the payment link must be able to check the
   * result on their phone. We disclose ONLY the minimum info
   * (status + paid flag + amount) so the endpoint cannot be used
   * to enumerate other customers' orders.
   */
  @Get('status/:orderId')
  @ApiOperation({
    summary: 'Public order payment status (for customer return pages)',
  })
  async publicOrderStatus(
    @Param('orderId') orderId: string,
  ): Promise<PublicOrderStatusDto> {
    if (!orderId || orderId.length < 32) {
      throw new BadRequestException('orderId is required (UUID)');
    }
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        walletSettledAt: true,
        totalPrice: true,
        posGatewayTrackId: true,
      },
    });
    if (!order) {
      throw new BadRequestException('Order not found');
    }

    // V1.7.1 — Lazy reconciliation for environments where the webhook
    // cannot reach the API (local dev, private networks, etc.). Only
    // triggers when the order still looks unsettled AND we have a
    // trackId on file. We ALWAYS ask UPayments with our API key, so an
    // attacker hitting this endpoint cannot flip orders to PAID — only
    // a real CAPTURED/AUTHORIZED result on UPayments' side will do it.
    let settled = Boolean(order.walletSettledAt);
    let status = order.status;
    if (!settled && status !== OrderStatus.COMPLETED && order.posGatewayTrackId) {
      try {
        const inquiry = await this.paymentsService.fetchGatewayStatus(
          order.posGatewayTrackId,
        );
        const outcome = this.paymentsService.normalizeCallbackStatus(
          inquiry.data.result ?? '',
        );
        if (inquiry.ok && outcome === 'success') {
          await this.paymentsService.finalizePaidOrderFromGateway(
            order.id,
            {
              provider: 'upayments',
              trackId: order.posGatewayTrackId,
              source: 'PUBLIC_STATUS_POLL',
              paymentId: inquiry.data.paymentId ?? null,
              tranId: inquiry.data.transactionId ?? null,
              result: inquiry.data.result ?? null,
              amount: String(inquiry.data.amount ?? ''),
              inquiryRaw: inquiry.raw,
            } as never,
          );
          settled = true;
          status = OrderStatus.COMPLETED;
        }
      } catch (err) {
        this.logger.warn(
          `Lazy reconciliation failed for order ${order.id}: ${(err as Error).message}`,
        );
      }
    }

    return {
      orderId: order.id,
      status,
      isPaid: status === OrderStatus.COMPLETED || settled,
      amountKd: order.totalPrice.toFixed(3),
    };
  }
}

/** Extract `orderId=<uuid>` from UPayments' `customerExtraData`. */
function extractOrderIdFromExtraData(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/orderId=([0-9a-fA-F-]{36})/);
  return match?.[1] ?? null;
}

/** Fish the orderId out of whatever envelope the webhook arrived in. */
function extractOrderId(body: PaymentCallbackDto): string | null {
  if (body.orderId) return body.orderId;
  return extractOrderIdFromExtraData(body.customerExtraData);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 400);
  } catch {
    return '[unserializable]';
  }
}
