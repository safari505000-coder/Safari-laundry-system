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
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBody,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../common/services/payments.service';
import { GatewayTrackHintDto } from './dto/gateway-track-hint.dto';
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
   * contract expected, so we do not trust arbitrary fields alone:
   *
   *   1. If `devMock` is set AND mock mode is enabled, take the
   *      legacy `{orderId, status}` pair and finalize — used by
   *      local dev + the mock-checkout HTML page only.
   *   2. If the body already says CAPTURED (normalized), `track_id`
   *      ends with `v2`, and we can resolve a Safari `Order.id` from
   *      `requested_order_id` / `trn_udf` / etc., we finalize immediately
   *      — this is the authoritative path when the shopper never opens
   *      our return page (webhook as source of truth).
   *   3. Otherwise, pull `trackId` from the body and call UPayments'
   *      `GET /api/v1/get-payment-status/{trackId}` as a backstop when
   *      the body alone is incomplete or trusted finalize fails.
   *   4. If the legacy HMAC `signature` field IS present AND we're
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
    // UPayments official webhook uses `track_id` (snake_case); camelCase
    // variants appear on some partner paths — accept all.
    const trackId =
      body.track_id?.trim() ||
      body.trackId?.trim() ||
      body.TrackID?.trim() ||
      body.gatewayReference?.trim() ||
      '';

    if (trackId) {
      this.logger.log(
        `UPayments callback: received trackId prefix=${trackId.slice(0, 12)}…`,
      );

      const safariOrderFromBody = extractOrderId(body);
      const bodyOutcome = this.paymentsService.normalizeCallbackStatus(
        body.result ?? body.status ?? '',
      );
      const trustWebhookFinalize =
        Boolean(safariOrderFromBody) &&
        bodyOutcome === 'success' &&
        /v2$/i.test(trackId.trim());

      if (trustWebhookFinalize) {
        this.logger.log(
          `UPayments callback: trusted webhook (CAPTURED + v2 + Safari order) orderId=${safariOrderFromBody} — finalize without inquiry`,
        );
        try {
          const tr =
            await this.paymentsService.tryFinalizeOrderFromTrustedUpaymentsReturn(
              safariOrderFromBody!,
              trackId,
              String(body.result ?? body.status ?? ''),
              'UPayments_WEBHOOK_TRUSTED_BODY',
              {
                paymentId: body.payment_id ?? body.paymentId ?? null,
                tranId: body.tran_id ?? body.tranId ?? null,
                amount: body.amount,
              },
            );
          if (tr.finalized) {
            this.logger.log(
              `UPayments callback: finalize (trusted) done orderId=${safariOrderFromBody}`,
            );
            return {
              ok: true as const,
              orderId: safariOrderFromBody!,
              trackId,
              outcome: 'success' as const,
            };
          }
          this.logger.warn(
            `UPayments callback: trusted finalize no-op orderId=${safariOrderFromBody} — falling back to inquiry`,
          );
        } catch (err) {
          this.logger.warn(
            `UPayments callback: trusted finalize failed orderId=${safariOrderFromBody}: ${(err as Error).message} — falling back to inquiry`,
          );
        }
      }

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
      let willFinalize = outcome === 'success' && inquiry.ok;
      this.logger.log(
        `UPayments callback: orderId=${resolvedOrderId} gatewayResult=${inquiry.data.result ?? 'n/a'} normalizedOutcome=${outcome} inquiryOk=${inquiry.ok} willFinalize=${willFinalize}`,
      );

      if (willFinalize) {
        await this.paymentsService.finalizePaidOrderFromGateway(
          resolvedOrderId,
          {
            provider: 'upayments',
            trackId,
            paymentId:
              inquiry.data.paymentId ??
              body.paymentId ??
              body.payment_id ??
              null,
            tranId:
              inquiry.data.transactionId ??
              body.tranId ??
              body.tran_id ??
              null,
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
      } else if (
        !inquiry.ok &&
        safariOrderFromBody &&
        this.paymentsService.normalizeCallbackStatus(
          body.result ?? body.status ?? '',
        ) === 'success' &&
        /v2$/i.test(trackId.trim())
      ) {
        this.logger.warn(
          `UPayments callback: inquiry failed for trackId prefix=${trackId.slice(0, 16)}… — finalizing from webhook body (Safari orderId=${safariOrderFromBody})`,
        );
        const tr =
          await this.paymentsService.tryFinalizeOrderFromTrustedUpaymentsReturn(
            safariOrderFromBody,
            trackId,
            String(body.result ?? body.status ?? ''),
            'UPayments_WEBHOOK_BODY_INQUIRY_FAILED',
            {
              paymentId: body.payment_id ?? body.paymentId ?? null,
              tranId: body.tran_id ?? body.tranId ?? null,
              amount: body.amount,
            },
          );
        if (tr.finalized) {
          willFinalize = true;
          this.logger.log(
            `UPayments callback: finalize after inquiry fail done orderId=${safariOrderFromBody}`,
          );
        }
      }

      return {
        ok: true as const,
        orderId: resolvedOrderId,
        trackId,
        outcome: willFinalize ? ('success' as const) : outcome,
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
   *
   * V1.7.4 — `POST` with `{ "trackId": "…v2" }` is preferred when the
   * v2 id is known: some CDNs strip query strings before Node.
   */
  @Get('status/:orderId')
  @ApiOperation({
    summary: 'Public order payment status (for customer return pages)',
  })
  async publicOrderStatusGet(
    @Req() req: Request,
    @Param('orderId') orderId: string,
    @Query('track_id') track_id?: string,
    @Query('TrackID') trackID?: string,
    @Query('trackId') trackIdQuery?: string,
    @Query('result') gatewayResultQuery?: string,
  ): Promise<PublicOrderStatusDto> {
    return this.runPublicOrderStatusPoll(
      orderId,
      req,
      track_id,
      trackID,
      trackIdQuery,
      undefined,
      undefined,
      gatewayResultQuery,
    );
  }

  @Post('status/:orderId')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Public order payment status (POST — trackId in JSON when query is stripped)',
  })
  @ApiBody({ type: GatewayTrackHintDto, required: false })
  async publicOrderStatusPost(
    @Req() req: Request,
    @Param('orderId') orderId: string,
    @Body() body: GatewayTrackHintDto,
    @Query('track_id') track_id?: string,
    @Query('TrackID') trackID?: string,
    @Query('trackId') trackIdQuery?: string,
    @Query('result') gatewayResultQuery?: string,
  ): Promise<PublicOrderStatusDto> {
    return this.runPublicOrderStatusPoll(
      orderId,
      req,
      track_id,
      trackID,
      trackIdQuery,
      body?.trackId ?? body?.track_id,
      body?.result,
      gatewayResultQuery,
    );
  }

  private async runPublicOrderStatusPoll(
    orderId: string,
    req: Request,
    track_id?: string,
    trackID?: string,
    trackIdQuery?: string,
    bodyTrackId?: string,
    gatewayResultFromBody?: string,
    gatewayResultQuery?: string,
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

    const returnTrack = pickReturnTrackIdFromRequest(
      bodyTrackId,
      track_id,
      trackID,
      trackIdQuery,
      req,
    );
    const gatewayResultRaw = pickGatewayReturnResultFromRequest(
      gatewayResultFromBody,
      gatewayResultQuery,
      req,
    );

    let settled = Boolean(order.walletSettledAt);
    let status = order.status;
    if (!settled && status !== OrderStatus.COMPLETED) {
      if (gatewayResultRaw && returnTrack) {
        try {
          const tr =
            await this.paymentsService.tryFinalizeOrderFromTrustedUpaymentsReturn(
              order.id,
              returnTrack,
              gatewayResultRaw,
              'PUBLIC_STATUS_POLL_TRUSTED_RETURN_URL',
            );
          if (tr.finalized) {
            settled = true;
            status = OrderStatus.COMPLETED;
          }
        } catch (err) {
          this.logger.warn(
            `Trusted return-url finalize failed for order ${order.id}: ${(err as Error).message}`,
          );
        }
      }
    }

    if (!settled && status !== OrderStatus.COMPLETED) {
      const candidates = buildUpaymentsInquiryTrackCandidates(
        returnTrack,
        order.posGatewayTrackId,
      );
      for (const tid of candidates) {
        try {
          const r =
            await this.paymentsService.tryFinalizeOrderIfUpaymentsCaptured(
              order.id,
              tid,
              tid === returnTrack
                ? 'PUBLIC_STATUS_POLL_RETURN_TRACK'
                : 'PUBLIC_STATUS_POLL',
            );
          if (r.finalized) {
            settled = true;
            status = OrderStatus.COMPLETED;
            break;
          }
        } catch (err) {
          this.logger.warn(
            `Lazy reconciliation failed for order ${order.id}: ${(err as Error).message}`,
          );
        }
      }
    }

    return {
      orderId: order.id,
      status,
      isPaid: status === OrderStatus.COMPLETED || settled,
      amountKd: order.totalPrice.toFixed(3),
    };
  }

  /**
   * Customer-triggered re-check. Public like `/status/:orderId`. When the
   * return URL echoes `result=CAPTURED` and a v2 `track_id`, finalizes
   * without waiting on UPayments inquiry; otherwise uses get-payment-status
   * and returns an Arabic message for the UI.
   */
  @Post('recheck/:orderId')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Force payment verification and finalize if CAPTURED',
    description:
      'Public — for /payment/success|failed. When `result=CAPTURED` and v2 `track_id` are echoed from the return URL, finalizes without waiting for UPayments inquiry; otherwise uses get-payment-status as a backstop.',
  })
  @ApiBody({ type: GatewayTrackHintDto, required: false })
  async recheckPayment(
    @Req() req: Request,
    @Param('orderId') orderId: string,
    @Body() body: GatewayTrackHintDto,
    @Query('track_id') track_id?: string,
    @Query('TrackID') trackID?: string,
    @Query('trackId') trackIdQuery?: string,
    @Query('result') gatewayResultQuery?: string,
  ): Promise<{
    orderId: string;
    status: OrderStatus;
    isPaid: boolean;
    amountKd: string;
    trackIdPresent: boolean;
    gatewayResult: string | null;
    settledNow: boolean;
    messageAr: string;
  }> {
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

    let status = order.status;
    let isPaid =
      status === OrderStatus.COMPLETED || Boolean(order.walletSettledAt);
    let gatewayResult: string | null = null;
    let settledNow = false;

    if (isPaid) {
      return {
        orderId: order.id,
        status,
        isPaid: true,
        amountKd: order.totalPrice.toFixed(3),
        trackIdPresent: Boolean(order.posGatewayTrackId),
        gatewayResult: null,
        settledNow: false,
        messageAr: 'الدفع مؤكَّد. شكراً لك.',
      };
    }

    const returnTrack = pickReturnTrackIdFromRequest(
      body?.trackId ?? body?.track_id,
      track_id,
      trackID,
      trackIdQuery,
      req,
    );
    const gatewayResultRaw = pickGatewayReturnResultFromRequest(
      body?.result,
      gatewayResultQuery,
      req,
    );

    if (!isPaid && gatewayResultRaw && returnTrack) {
      try {
        const tr =
          await this.paymentsService.tryFinalizeOrderFromTrustedUpaymentsReturn(
            order.id,
            returnTrack,
            gatewayResultRaw,
            'CUSTOMER_RECHECK_TRUSTED_RETURN_URL',
          );
        if (tr.finalized) {
          this.logger.log(
            `UPayments manual recheck: finalized (trusted return URL) orderId=${order.id}`,
          );
          return {
            orderId: order.id,
            status: OrderStatus.COMPLETED,
            isPaid: true,
            amountKd: order.totalPrice.toFixed(3),
            trackIdPresent: true,
            gatewayResult: gatewayResultRaw,
            settledNow: true,
            messageAr: 'تم تأكيد الدفع بنجاح! نحدّث الفاتورة الآن.',
          };
        }
      } catch (err) {
        this.logger.warn(
          `Trusted recheck finalize failed orderId=${order.id}: ${(err as Error).message}`,
        );
      }
    }

    if (!returnTrack && !order.posGatewayTrackId) {
      return {
        orderId: order.id,
        status,
        isPaid: false,
        amountKd: order.totalPrice.toFixed(3),
        trackIdPresent: false,
        gatewayResult: null,
        settledNow: false,
        messageAr:
          'لا يوجد معرّف دفع مرتبط بهذا الطلب. يرجى التواصل مع مركز الخدمة.',
      };
    }

    this.logger.log(
      `UPayments manual recheck: orderId=${order.id} hasReturnTrack=${Boolean(returnTrack)} posTrack=${order.posGatewayTrackId ? 'yes' : 'no'}`,
    );

    try {
      const candidates = buildUpaymentsInquiryTrackCandidates(
        returnTrack,
        order.posGatewayTrackId,
      );
      for (const tid of candidates) {
        const r = await this.paymentsService.tryFinalizeOrderIfUpaymentsCaptured(
          order.id,
          tid,
          tid === returnTrack
            ? 'CUSTOMER_RECHECK_RETURN_TRACK'
            : 'CUSTOMER_RECHECK',
        );
        gatewayResult = r.gatewayResult;
        if (r.finalized) {
          status = OrderStatus.COMPLETED;
          isPaid = true;
          settledNow = true;
          this.logger.log(
            `UPayments manual recheck: finalized orderId=${order.id}`,
          );
          break;
        }
      }
    } catch (err) {
      this.logger.warn(
        `UPayments manual recheck error orderId=${order.id}: ${(err as Error).message}`,
      );
      return {
        orderId: order.id,
        status,
        isPaid: false,
        amountKd: order.totalPrice.toFixed(3),
        trackIdPresent: Boolean(returnTrack || order.posGatewayTrackId),
        gatewayResult: null,
        settledNow: false,
        messageAr:
          'تعذّر الاتصال ببوابة الدفع الآن. جرّب «إعادة التحقق» مرة أخرى خلال لحظات.',
      };
    }

    const messageAr =
      isPaid && settledNow
        ? 'تم تأكيد الدفع بنجاح! نحدّث الفاتورة الآن.'
        : gatewayResult && gatewayResult.trim().length > 0
          ? `بوابة الدفع ترد بالحالة: «${gatewayResult}». إن خُصم المبلغ من حسابك ولم يُسوَّ خلال دقائق يرجى التواصل مع مركز الخدمة.`
          : 'الدفع لم يُكمَل لدى البوابة بعد. إن كنت أتممت الدفع، انتظر دقيقة ثم أعد التحقق.';

    return {
      orderId: order.id,
      status,
      isPaid,
      amountKd: order.totalPrice.toFixed(3),
      trackIdPresent: Boolean(returnTrack || order.posGatewayTrackId),
      gatewayResult,
      settledNow,
      messageAr,
    };
  }
}

/**
 * Read track hint from the parsed JSON body before relying on `@Body()`
 * DTO binding (some proxies / versions leave `req.body` intact while the
 * transformed instance omits fields).
 */
function readGatewayTrackIdFromPlainBody(req: Request): string {
  const raw = req.body as unknown;
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return '';
  }
  const o = raw as Record<string, unknown>;
  for (const k of ['trackId', 'track_id', 'TrackID', 'gateway_track_id'] as const) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) {
      return v.trim();
    }
  }
  return '';
}

/** Prefer v2 `…v2` ids over long numeric session ids for `get-payment-status`. */
function upaymentTrackInquirySortKey(tid: string): number {
  const t = tid.trim();
  if (!t) {
    return 99;
  }
  if (/v2$/i.test(t)) {
    return 0;
  }
  if (/^\d{18,}$/.test(t)) {
    return 2;
  }
  if (/^\d+$/.test(t)) {
    return 1;
  }
  return 1;
}

function buildUpaymentsInquiryTrackCandidates(
  returnTrack: string,
  posGatewayTrackId?: string | null,
): string[] {
  const rt = typeof returnTrack === 'string' ? returnTrack.trim() : '';
  const parts = [rt, posGatewayTrackId ?? '']
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter((s) => s.length > 0);
  const unique = [...new Set(parts)];
  // Hosted `session_id` values are not valid for UPayments get-payment-status.
  // When the return URL supplies a v2 `track_id`, do not fall through to the
  // persisted session id — it only yields "Transaction not found" after the
  // real v2 inquiry returned a non-final status (race) or order mismatch.
  const filtered =
    rt && /v2$/i.test(rt)
      ? unique.filter((t) => !/^\d{18,}$/.test(t.trim()))
      : unique;
  const list = filtered.length > 0 ? filtered : unique;
  list.sort(
    (a, b) => upaymentTrackInquirySortKey(a) - upaymentTrackInquirySortKey(b),
  );
  return list;
}

/**
 * Prefer JSON body (`trackId` / `track_id`), then `@Body()` hint, `@Query`,
 * header, raw URL, then `req.query`.
 */
function pickReturnTrackIdFromRequest(
  bodyTrackId: string | undefined,
  track_id: string | undefined,
  trackID: string | undefined,
  trackIdQuery: string | undefined,
  req: Request,
): string {
  const fromPlainBody = readGatewayTrackIdFromPlainBody(req);
  if (fromPlainBody) {
    return fromPlainBody;
  }
  const fromBody = bodyTrackId?.trim();
  if (fromBody) {
    return fromBody;
  }
  const fromDecorators =
    track_id?.trim() || trackID?.trim() || trackIdQuery?.trim() || '';
  if (fromDecorators) {
    return fromDecorators;
  }
  const fromHeader = readGatewayTrackIdFromRequestHeaders(req);
  if (fromHeader) {
    return fromHeader;
  }
  const fromRawUrl = extractTrackIdFromRequestUrl(req);
  if (fromRawUrl) {
    return fromRawUrl;
  }
  if (!req.query || typeof req.query !== 'object') {
    const fromRefererEarly = extractPaymentReturnHintsFromReferer(req).trackId;
    if (fromRefererEarly) {
      return fromRefererEarly;
    }
    return '';
  }
  const q = req.query as Record<string, string | string[] | undefined>;
  const g = (key: string): string => {
    const v = q[key];
    if (v === undefined) {
      return '';
    }
    if (Array.isArray(v)) {
      return (v[0] ?? '').trim();
    }
    return String(v).trim();
  };
  const direct =
    g('track_id') ||
    g('TrackID') ||
    g('trackId') ||
    g('gateway_track_id');
  if (direct) {
    return direct;
  }
  for (const key of Object.keys(q)) {
    if (/^track_?id$/i.test(key)) {
      const v = g(key);
      if (v) {
        return v;
      }
    }
  }
  const fromReferer = extractPaymentReturnHintsFromReferer(req).trackId;
  if (fromReferer) {
    return fromReferer;
  }
  return '';
}

function normalizeAmpInQueryString(qs: string): string {
  return qs.replace(/&amp;/gi, '&').replace(/%26amp%3B/gi, '&');
}

/**
 * Public payment pages send this when query params are stripped by a proxy
 * but the browser still needs the v2 id for `get-payment-status`.
 * Value is only used for UPayments inquiry + order binding — not a secret.
 */
function readGatewayTrackIdFromRequestHeaders(req: Request): string {
  const raw =
    req.headers['x-gateway-track-id'] ??
    req.headers['X-Gateway-Track-Id'] ??
    '';
  if (Array.isArray(raw)) {
    return (raw[0] ?? '').trim();
  }
  return String(raw).trim();
}

/**
 * Read `track_id` from the raw URL line. Handles `?` as literal or `%3F`,
 * and `&amp;` entity sequences in the query segment.
 */
function extractTrackIdFromRequestUrl(req: Request): string {
  let raw =
    (typeof req.originalUrl === 'string' && req.originalUrl.length > 0
      ? req.originalUrl
      : null) ??
    (typeof req.url === 'string' && req.url.length > 0 ? req.url : '') ??
    '';
  raw = normalizeAmpInQueryString(raw);
  try {
    raw = decodeURIComponent(raw);
  } catch {
    /* keep */
  }
  const m = /[?&]track_id=([^&#]+)/i.exec(raw);
  if (m?.[1]) {
    try {
      return decodeURIComponent(m[1].trim());
    } catch {
      return m[1].trim();
    }
  }
  const qMark = raw.indexOf('?');
  if (qMark < 0) {
    return '';
  }
  let qs = raw.slice(qMark + 1).split('#')[0];
  qs = normalizeAmpInQueryString(qs);
  const sp = new URLSearchParams(qs);
  return (
    sp.get('track_id')?.trim() ||
    sp.get('TrackID')?.trim() ||
    sp.get('trackId')?.trim() ||
    ''
  );
}

function readGatewayResultFromPlainBody(req: Request): string {
  const raw = req.body as unknown;
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return '';
  }
  const o = raw as Record<string, unknown>;
  const v = o.result ?? o.Result;
  if (typeof v === 'string' && v.trim()) {
    return v.trim();
  }
  return '';
}

function extractGatewayResultFromRequestUrl(req: Request): string {
  let raw =
    (typeof req.originalUrl === 'string' && req.originalUrl.length > 0
      ? req.originalUrl
      : null) ??
    (typeof req.url === 'string' && req.url.length > 0 ? req.url : '') ??
    '';
  raw = normalizeAmpInQueryString(raw);
  try {
    raw = decodeURIComponent(raw);
  } catch {
    /* keep */
  }
  const m = /[?&]result=([^&#]+)/i.exec(raw);
  if (m?.[1]) {
    try {
      return decodeURIComponent(m[1].trim());
    } catch {
      return m[1].trim();
    }
  }
  const qMark = raw.indexOf('?');
  if (qMark < 0) {
    return '';
  }
  let qs = raw.slice(qMark + 1).split('#')[0];
  qs = normalizeAmpInQueryString(qs);
  return new URLSearchParams(qs).get('result')?.trim() || '';
}

function pickGatewayReturnResultFromRequest(
  bodyResult: string | undefined,
  resultQuery: string | undefined,
  req: Request,
): string {
  const fromPlain = readGatewayResultFromPlainBody(req);
  if (fromPlain) {
    return fromPlain;
  }
  const fromBody = bodyResult?.trim();
  if (fromBody) {
    return fromBody;
  }
  const fromQuery = resultQuery?.trim();
  if (fromQuery) {
    return fromQuery;
  }
  const fromUrl = extractGatewayResultFromRequestUrl(req);
  if (fromUrl) {
    return fromUrl;
  }
  return extractPaymentReturnHintsFromReferer(req).result;
}

/**
 * Browser often sends `Referer: https://…/payment/success?result=CAPTURED&track_id=…v2`
 * on same-origin POSTs. Used when JSON/query hints were stripped upstream.
 */
function extractPaymentReturnHintsFromReferer(req: Request): {
  trackId: string;
  result: string;
} {
  const header =
    (typeof req.get === 'function' && req.get('referer')) ||
    (typeof req.get === 'function' && req.get('referrer')) ||
    (req.headers['referer'] as string | undefined) ||
    (req.headers['referrer'] as string | undefined) ||
    '';
  if (!header || typeof header !== 'string') {
    return { trackId: '', result: '' };
  }
  try {
    const u = new URL(header);
    const trackId =
      u.searchParams.get('track_id')?.trim() ||
      u.searchParams.get('TrackID')?.trim() ||
      u.searchParams.get('trackId')?.trim() ||
      '';
    const result =
      u.searchParams.get('result')?.trim() ||
      u.searchParams.get('Result')?.trim() ||
      '';
    return { trackId, result };
  } catch {
    return { trackId: '', result: '' };
  }
}

/** Prisma-style UUID v4 (Safari `Order.id`). */
const SAFARI_ORDER_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseSafariOrderUuid(raw: string | undefined | null): string | null {
  const t = raw?.trim();
  if (!t) return null;
  return SAFARI_ORDER_UUID_RE.test(t) ? t : null;
}

/** Extract `orderId=<uuid>` from UPayments' `customerExtraData`. */
function extractOrderIdFromExtraData(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/orderId=([0-9a-fA-F-]{36})/i);
  const id = match?.[1];
  return id && SAFARI_ORDER_UUID_RE.test(id) ? id : null;
}

function extractOrderIdFromTrnUdf(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/orderId=([0-9a-fA-F-]{36})/i);
  const id = match?.[1];
  return id && SAFARI_ORDER_UUID_RE.test(id) ? id : null;
}

/**
 * UPayments invoice «الرقم المرجعي» often looks like `u4c7e30f65039e4de4b3cf97309077c3c1`
 * (single letter + 32 hex = Safari `Order.id` without hyphens).
 */
function tryOrderIdFromUpaymentsCompactRef(
  raw: string | undefined | null,
): string | null {
  const t = raw?.trim();
  if (!t) return null;
  const noHyphen = t.replace(/-/g, '');
  let hex = noHyphen;
  if (/^[a-z][0-9a-f]{32}$/i.test(hex)) {
    hex = hex.slice(1);
  }
  if (!/^[0-9a-f]{32}$/i.test(hex)) {
    return null;
  }
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return parseSafariOrderUuid(uuid);
}

/** Fish the Safari order UUID out of whatever envelope the webhook arrived in. */
function extractOrderId(body: PaymentCallbackDto): string | null {
  const legacy = parseSafariOrderUuid(body.orderId);
  if (legacy) return legacy;
  const requested = parseSafariOrderUuid(body.requested_order_id);
  if (requested) return requested;
  const gatewayOid = parseSafariOrderUuid(body.order_id);
  if (gatewayOid) return gatewayOid;
  const fromRef =
    tryOrderIdFromUpaymentsCompactRef(body.ref) ??
    tryOrderIdFromUpaymentsCompactRef(body.reference);
  if (fromRef) return fromRef;
  return (
    extractOrderIdFromExtraData(body.customerExtraData) ??
    extractOrderIdFromTrnUdf(body.trn_udf)
  );
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 400);
  } catch {
    return '[unserializable]';
  }
}
