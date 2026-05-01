import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
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
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  PaymentsService,
  isValidUpaymentsPaymentStatusInquiryId,
} from '../common/services/payments.service';
import { APP_VERSION } from '../common/constants/app-version';
import { buildPublicInvoicePdfUrl } from '../orders/invoice-pdf.util';
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
  @ApiProperty({ description: 'Alias for clients that only need { paid: boolean }.' })
  paid!: boolean;
  @ApiProperty({ description: 'Amount in KWD, 3 decimals, as a string.' })
  amountKd!: string;
  /**
   * V1.7.1 — short POS serial like `A-47` used on the luxury success page
   * so customers never see the raw UUID. `invoiceNumber` is the longer
   * back-office format; serialNumber wins when both are set.
   */
  @ApiProperty({
    description:
      'Short POS serial (e.g. "A-47"). Prefer showing this to the customer on receipts.',
    required: false,
    nullable: true,
    type: String,
  })
  serialNumber!: string | null;
  @ApiProperty({
    description: 'Back-office invoice number. Falls back to `serialNumber`.',
    required: false,
    nullable: true,
    type: String,
  })
  invoiceNumber!: string | null;
  @ApiProperty({
    description:
      'V1.7.1 — Direct PDF download URL (signed 15m token, purpose INVOICE_SHARE). Only present once `isPaid=true` and `PUBLIC_API_URL` is configured.',
    required: false,
    nullable: true,
    type: String,
  })
  pdfUrl!: string | null;
  @ApiProperty({
    description:
      'V1.7.1 — Customer-facing SPA share URL for the invoice. Only present once `isPaid=true` and `PUBLIC_WEB_APP_URL` is configured.',
    required: false,
    nullable: true,
    type: String,
  })
  shareUrl!: string | null;
}

/**
 * UPayments merchant dashboard labels the **get-payment-status** path value as
 * `trans_id` / `tran_id`; official HTTP docs name the same path segment
 * `track_id`. Prefer dashboard spellings when multiple ids appear in one payload.
 */
function mergeGatewayInquiryIdFromHintDto(
  hint: GatewayTrackHintDto | undefined,
): string | undefined {
  if (!hint) return undefined;
  const s =
    hint.trans_id?.trim() ||
    hint.transId?.trim() ||
    hint.tran_id?.trim() ||
    hint.tranId?.trim() ||
    hint.trackId?.trim() ||
    hint.track_id?.trim() ||
    '';
  return s || undefined;
}

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private async attachGatewayTrackIdToOrder(
    orderId: string | null,
    trackId: string | undefined,
  ): Promise<void> {
    const cleanOrderId = parseSafariOrderUuid(orderId);
    const cleanTrackId = trackId?.trim();
    if (
      !cleanOrderId ||
      !cleanTrackId ||
      !isValidUpaymentsPaymentStatusInquiryId(cleanTrackId)
    ) {
      return;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: cleanOrderId },
      select: { posGatewayTrackId: true },
    });
    const existing = order?.posGatewayTrackId?.trim() ?? '';
    if (existing === cleanTrackId) {
      return;
    }
    if (existing && !/^\d{18,}$/.test(existing)) {
      this.logger.warn(
        `track_id_attach_skipped orderId=${cleanOrderId} existing=${existing.slice(0, 16)} incoming=${cleanTrackId.slice(0, 16)}`,
      );
      return;
    }

    await this.prisma.order.update({
      where: { id: cleanOrderId },
      data: { posGatewayTrackId: cleanTrackId },
    });
    this.logger.log(
      `track_id_attached_to_order orderId=${cleanOrderId} trackId=${cleanTrackId} version=${APP_VERSION}`,
    );
  }

  /**
   * V1.7.1 — Build the customer-facing invoice share URL + binary PDF URL
   * for a given `orderId`. Mirrors `OrdersService.mintInvoiceShareLink`
   * (7-day JWT, `purpose: INVOICE_SHARE`) but stays inside the payments
   * module to avoid the Orders↔Payments cycle.
   *
   * Called from `runPublicOrderStatusPoll` / `runRecheckPayment` once the
   * order is actually settled so the luxury success page can offer
   * "Download PDF" + "Share via WhatsApp" without a second round-trip.
   */
  private async mintInvoiceShareUrlsForOrder(
    orderId: string,
  ): Promise<{ pdfUrl: string | null; shareUrl: string | null }> {
    try {
      const token = await this.jwt.signAsync(
        { purpose: 'INVOICE_SHARE' as const, orderId },
        { expiresIn: '7d' },
      );
      const pdfUrl = buildPublicInvoicePdfUrl(token) ?? null;
      const webBase = process.env.PUBLIC_WEB_APP_URL?.trim().replace(/\/$/, '');
      const shareUrl = webBase
        ? `${webBase}/public/invoice/${encodeURIComponent(token)}`
        : null;
      return { pdfUrl, shareUrl };
    } catch (err) {
      this.logger.warn(
        `Failed to mint invoice share token for order ${orderId.slice(0, 8)}…: ${(err as Error).message}`,
      );
      return { pdfUrl: null, shareUrl: null };
    }
  }

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
   *   2. Pull the payment-status id (prefer `trans_id` / `tran_id`,
   *      else `track_id`) and call UPayments'
   *      `GET /api/v1/get-payment-status/{trackId}`. The Gateway API is the
   *      source of truth for whether money was captured.
   *   3. Finalize only after matching the verified gateway result back to a
   *      Safari `Order.id` and validating the amount returned by the gateway.
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
    this.logger.log(
      `UPayments callback received requested_order_id=${body.requested_order_id ?? 'n/a'} track_id=${body.track_id ?? body.trackId ?? body.trans_id ?? body.tran_id ?? 'n/a'} result=${body.result ?? body.status ?? 'n/a'} version=${APP_VERSION}`,
    );
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
    // Merchant dashboard: primary id for payment-status is often **trans_id**
    // / **tran_id**; official API docs also call the path segment `track_id`.
    const callbackTrackId =
      body.track_id?.trim() || body.trackId?.trim() || body.TrackID?.trim() || '';
    await this.attachGatewayTrackIdToOrder(extractOrderId(body), callbackTrackId);
    const rawGatewayInquiryId =
      callbackTrackId ||
      body.trans_id?.trim() ||
      body.transId?.trim() ||
      body.tran_id?.trim() ||
      body.tranId?.trim() ||
      '';

    let gatewayInquiryId = rawGatewayInquiryId;
    if (
      gatewayInquiryId &&
      !isValidUpaymentsPaymentStatusInquiryId(gatewayInquiryId)
    ) {
      this.logger.warn(
        `UPayments callback: rejecting corrupt/oversize inquiry id from webhook (len=${gatewayInquiryId.length})`,
      );
      gatewayInquiryId = '';
    }

    const safariForInquiryFallback = extractOrderId(body);
    if (!gatewayInquiryId && safariForInquiryFallback) {
      const row = await this.prisma.order.findUnique({
        where: { id: safariForInquiryFallback },
        select: { posGatewayTrackId: true },
      });
      const persisted = row?.posGatewayTrackId?.trim() ?? '';
      if (persisted && isValidUpaymentsPaymentStatusInquiryId(persisted)) {
        gatewayInquiryId = persisted;
        this.logger.log(
          `UPayments callback: using Order.posGatewayTrackId from DB (webhook id missing/invalid) order=${safariForInquiryFallback.slice(0, 8)}…`,
        );
      }
    }

    if (gatewayInquiryId) {
      this.logger.log(
        `UPayments callback: received payment-status id prefix=${gatewayInquiryId.slice(0, 12)}…`,
      );

      const inquiry = await this.paymentsService.fetchGatewayStatus(
        gatewayInquiryId,
      );
      const safariOrderFromBody = extractOrderId(body);
      const linkedOrderId =
        await this.paymentsService.findOrderByTrackId(gatewayInquiryId);
      const inquiryOrderId =
        parseSafariOrderUuid(inquiry.data.order?.id) ??
        extractOrderIdFromExtraData(inquiry.data.customerExtraData) ??
        tryOrderIdFromUpaymentsCompactRef(inquiry.data.order?.reference) ??
        tryOrderIdFromUpaymentsCompactRef(inquiry.data.reference);
      const resolvedOrderId =
        inquiryOrderId ??
        linkedOrderId ??
        safariOrderFromBody ??
        null;

      if (!resolvedOrderId) {
        this.logger.warn(
          `UPayments webhook for gatewayInquiryId=${gatewayInquiryId} — cannot map to a Safari order; body=${safeJson(body)}`,
        );
        return {
          ok: true as const,
          outcome: 'failed' as const,
          reason: 'order-not-found',
        };
      }

      const order = await this.prisma.order.findUnique({
        where: { id: resolvedOrderId },
        select: {
          id: true,
          status: true,
          walletSettledAt: true,
          totalPrice: true,
        },
      });
      if (!order) {
        this.logger.warn(
          `UPayments callback: resolved order does not exist orderId=${resolvedOrderId} trackIdPrefix=${gatewayInquiryId.slice(0, 16)}`,
        );
        return {
          ok: true as const,
          orderId: resolvedOrderId,
          trackId: gatewayInquiryId,
          outcome: 'failed' as const,
          reason: 'order-not-found',
        };
      }
      if (inquiryOrderId && inquiryOrderId !== order.id) {
        this.logger.warn(
          `UPayments callback: gateway order mismatch inquiryOrder=${inquiryOrderId} resolvedOrder=${order.id} trackIdPrefix=${gatewayInquiryId.slice(0, 16)}`,
        );
        return {
          ok: true as const,
          orderId: order.id,
          trackId: gatewayInquiryId,
          outcome: 'failed' as const,
          reason: 'order-mismatch',
        };
      }
      if (linkedOrderId && linkedOrderId !== order.id) {
        this.logger.warn(
          `UPayments callback: stored track/order mismatch linkedOrder=${linkedOrderId} resolvedOrder=${order.id} trackIdPrefix=${gatewayInquiryId.slice(0, 16)}`,
        );
        return {
          ok: true as const,
          orderId: order.id,
          trackId: gatewayInquiryId,
          outcome: 'failed' as const,
          reason: 'track-order-mismatch',
        };
      }

      const outcome = this.paymentsService.normalizeCallbackStatus(
        inquiry.data.result ?? '',
      );
      let willFinalize = outcome === 'success' && inquiry.ok;
      const gatewayAmountMinor = parseKwdMinor(inquiry.data.amount);
      const orderAmountMinor = parseKwdMinor(order.totalPrice.toString());
      let blockedReason: string | null = null;
      if (willFinalize && gatewayAmountMinor === null) {
        willFinalize = false;
        blockedReason = 'amount-missing';
        this.logger.warn(
          `UPayments callback: gateway success without amount; not finalizing orderId=${order.id} trackIdPrefix=${gatewayInquiryId.slice(0, 16)}`,
        );
      } else if (
        willFinalize &&
        orderAmountMinor !== null &&
        gatewayAmountMinor !== orderAmountMinor
      ) {
        willFinalize = false;
        blockedReason = 'amount-mismatch';
        this.logger.warn(
          `UPayments callback: amount mismatch orderId=${order.id} expectedMinor=${orderAmountMinor} gatewayMinor=${gatewayAmountMinor} trackIdPrefix=${gatewayInquiryId.slice(0, 16)}`,
        );
      }
      this.logger.log(
        `UPayments callback: orderId=${order.id} gatewayResult=${inquiry.data.result ?? 'n/a'} normalizedOutcome=${outcome} inquiryOk=${inquiry.ok} willFinalize=${willFinalize}${blockedReason ? ` blockedReason=${blockedReason}` : ''}`,
      );

      if (
        willFinalize &&
        (order.walletSettledAt || order.status === OrderStatus.COMPLETED)
      ) {
        willFinalize = false;
        this.logger.log(
          `UPayments callback: duplicate/no-op order already settled orderId=${order.id}`,
        );
      } else if (willFinalize) {
        this.logger.log(
          `about_to_finalize orderId=${order.id} source=UPAYMENTS_CALLBACK trackId=${gatewayInquiryId} version=${APP_VERSION}`,
        );
        await this.paymentsService.finalizePaidOrderFromGateway(
          order.id,
          {
            provider: 'upayments',
            trackId: gatewayInquiryId,
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
          `UPayments callback: verified finalize done orderId=${order.id}`,
        );
      }

      if (!willFinalize && outcome === 'success') {
        this.logger.warn(
          `UPayments callback: gateway outcome success but Safari order NOT finalized — invoice may remain unpaid pending manual reconcile orderId=${order.id} trackIdPrefix=${gatewayInquiryId.slice(0, 16)}${blockedReason ? ` reason=${blockedReason}` : ''}`,
        );
      }

      return {
        ok: true as const,
        orderId: order.id,
        trackId: gatewayInquiryId,
        outcome:
          willFinalize ||
          order.walletSettledAt ||
          order.status === OrderStatus.COMPLETED
            ? ('success' as const)
            : outcome,
        ...(blockedReason ? { reason: blockedReason } : {}),
      };
    }

    // --- Legacy fallback: HMAC-signed webhook (non-UPayments gateway) ---
    this.logger.warn(
      `UPayments callback: no payment-status inquiry id (trans_id / tran_id / track_id) in body — keys=${Object.keys(body ?? {}).join(',') || 'empty'}; falling back to legacy HMAC (needs orderId)`,
    );
    if (!body.orderId) {
      throw new UnauthorizedException(
        'Callback missing payment-status inquiry id (trans_id / tran_id / track_id) and orderId — cannot verify payment',
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
      mergeGatewayInquiryIdFromHintDto(body),
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
        serialNumber: true,
        invoiceNumber: true,
        posGatewayTrackId: true,
        posHostedPaymentUrl: true,
      },
    });
    if (!order) {
      throw new BadRequestException('Order not found');
    }

    let returnTrack = pickReturnTrackIdFromRequest(
      bodyTrackId,
      track_id,
      trackID,
      trackIdQuery,
      req,
    );
    if (returnTrack && !isValidUpaymentsPaymentStatusInquiryId(returnTrack)) {
      this.logger.warn(
        `Ignoring invalid payment-status inquiry hint from return URL/body (len=${returnTrack.length}) order=${order.id.slice(0, 8)}…`,
      );
      returnTrack = '';
    }
    await this.attachGatewayTrackIdToOrder(order.id, returnTrack);
    const urlTrackFallback = extractUpaymentsInquiryIdFromHostedUrl(
      order.posHostedPaymentUrl,
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
        order.posGatewayTrackId ?? urlTrackFallback ?? null,
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

    const isPaid = status === OrderStatus.COMPLETED || settled;
    const share = isPaid
      ? await this.mintInvoiceShareUrlsForOrder(order.id)
      : { pdfUrl: null, shareUrl: null };
    return {
      orderId: order.id,
      status,
      isPaid,
      paid: isPaid,
      amountKd: order.totalPrice.toFixed(3),
      serialNumber: order.serialNumber ?? null,
      invoiceNumber: order.invoiceNumber ?? null,
      pdfUrl: share.pdfUrl,
      shareUrl: share.shareUrl,
    };
  }

  /**
   * Customer-triggered re-check. Public like `/status/:orderId`. When the
   * return URL echoes `result=CAPTURED` and a v2 `track_id`, finalizes
   * without waiting on UPayments inquiry; otherwise uses get-payment-status
   * and returns an Arabic message for the UI.
   *
   * V19.30 — **GET** mirrors **POST**: some static SPA hosts answer
   * `Cannot POST /api/...` when the bundle is not behind the API proxy.
   * Collections «تحقق من الدفع» uses GET; the success page may use either.
   */
  @Post('recheck/:orderId')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Force payment verification and finalize if CAPTURED (POST)',
    description:
      'Public — optional JSON body with trackId when query string was stripped.',
  })
  @ApiBody({ type: GatewayTrackHintDto, required: false })
  async recheckPaymentPost(
    @Req() req: Request,
    @Param('orderId') orderId: string,
    @Body() body: GatewayTrackHintDto,
    @Query('track_id') track_id?: string,
    @Query('TrackID') trackID?: string,
    @Query('trackId') trackIdQuery?: string,
    @Query('result') gatewayResultQuery?: string,
  ) {
    return this.runRecheckPayment(req, orderId, body, {
      track_id,
      trackID,
      trackIdQuery,
      gatewayResultQuery,
    });
  }

  @Get('recheck/:orderId')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Force payment verification and finalize if CAPTURED (GET)',
    description:
      'Same as POST — use when the SPA origin cannot POST to the API (static hosting / mis-proxy). Pass track_id and result as query params when available.',
  })
  async recheckPaymentGet(
    @Req() req: Request,
    @Param('orderId') orderId: string,
    @Query('track_id') track_id?: string,
    @Query('TrackID') trackID?: string,
    @Query('trackId') trackIdQuery?: string,
    @Query('result') gatewayResultQuery?: string,
  ) {
    return this.runRecheckPayment(req, orderId, undefined, {
      track_id,
      trackID,
      trackIdQuery,
      gatewayResultQuery,
    });
  }

  private async runRecheckPayment(
    req: Request,
    orderId: string,
    bodyHint: GatewayTrackHintDto | undefined,
    q: {
      track_id?: string;
      trackID?: string;
      trackIdQuery?: string;
      gatewayResultQuery?: string;
    },
  ): Promise<{
    orderId: string;
    status: OrderStatus;
    isPaid: boolean;
    paid: boolean;
    amountKd: string;
    trackIdPresent: boolean;
    gatewayResult: string | null;
    settledNow: boolean;
    messageAr: string;
    serialNumber: string | null;
    invoiceNumber: string | null;
    pdfUrl: string | null;
    shareUrl: string | null;
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
        serialNumber: true,
        invoiceNumber: true,
        posGatewayTrackId: true,
        posHostedPaymentUrl: true,
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
      const share = await this.mintInvoiceShareUrlsForOrder(order.id);
      return {
        orderId: order.id,
        status,
        isPaid: true,
        paid: true,
        amountKd: order.totalPrice.toFixed(3),
        trackIdPresent: Boolean(order.posGatewayTrackId),
        gatewayResult: null,
        settledNow: false,
        messageAr: 'الدفع مؤكَّد. شكراً لك.',
        serialNumber: order.serialNumber ?? null,
        invoiceNumber: order.invoiceNumber ?? null,
        pdfUrl: share.pdfUrl,
        shareUrl: share.shareUrl,
      };
    }

    let returnTrack = pickReturnTrackIdFromRequest(
      mergeGatewayInquiryIdFromHintDto(bodyHint),
      q.track_id,
      q.trackID,
      q.trackIdQuery,
      req,
    );
    if (returnTrack && !isValidUpaymentsPaymentStatusInquiryId(returnTrack)) {
      this.logger.warn(
        `Recheck: ignoring invalid inquiry hint (len=${returnTrack.length}) order=${orderId.slice(0, 8)}…`,
      );
      returnTrack = '';
    }
    const gatewayResultRaw = pickGatewayReturnResultFromRequest(
      bodyHint?.result,
      q.gatewayResultQuery,
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
          const share = await this.mintInvoiceShareUrlsForOrder(order.id);
          return {
            orderId: order.id,
            status: OrderStatus.COMPLETED,
            isPaid: true,
            paid: true,
            amountKd: order.totalPrice.toFixed(3),
            trackIdPresent: true,
            gatewayResult: gatewayResultRaw,
            settledNow: true,
            messageAr:
              'تم تأكيد الدفع بنجاح ✅ — تم تحديث الفاتورة في النظام.',
            serialNumber: order.serialNumber ?? null,
            invoiceNumber: order.invoiceNumber ?? null,
            pdfUrl: share.pdfUrl,
            shareUrl: share.shareUrl,
          };
        }
      } catch (err) {
        this.logger.warn(
          `Trusted recheck finalize failed orderId=${order.id}: ${(err as Error).message}`,
        );
      }
    }

    const urlTrackFallback = extractUpaymentsInquiryIdFromHostedUrl(
      order.posHostedPaymentUrl,
    );

    if (!returnTrack && !order.posGatewayTrackId && !urlTrackFallback) {
      return {
        orderId: order.id,
        status,
        isPaid: false,
        paid: false,
        amountKd: order.totalPrice.toFixed(3),
        trackIdPresent: false,
        gatewayResult: null,
        settledNow: false,
        messageAr:
          'الدفع لم يُكمَل لدى البوابة بعد. إن كنت أتممت الدفع، انتظر دقيقة ثم أعد التحقق.',
        serialNumber: order.serialNumber ?? null,
        invoiceNumber: order.invoiceNumber ?? null,
        pdfUrl: null,
        shareUrl: null,
      };
    }

    this.logger.log(
      `UPayments manual recheck: orderId=${order.id} hasReturnTrack=${Boolean(returnTrack)} posTrack=${order.posGatewayTrackId ? 'yes' : 'no'} urlTrack=${urlTrackFallback ? 'yes' : 'no'}`,
    );

    try {
      const candidates = buildUpaymentsInquiryTrackCandidates(
        returnTrack,
        order.posGatewayTrackId ?? urlTrackFallback ?? null,
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
        paid: false,
        amountKd: order.totalPrice.toFixed(3),
        trackIdPresent: Boolean(returnTrack || order.posGatewayTrackId),
        gatewayResult: null,
        settledNow: false,
        messageAr:
          'تعذّر الاتصال ببوابة الدفع الآن. جرّب «إعادة التحقق» مرة أخرى خلال لحظات.',
        serialNumber: order.serialNumber ?? null,
        invoiceNumber: order.invoiceNumber ?? null,
        pdfUrl: null,
        shareUrl: null,
      };
    }

    const messageAr =
      isPaid && settledNow
        ? 'تم تأكيد الدفع بنجاح ✅ — تم تحديث الفاتورة في النظام.'
        : gatewayResult && gatewayResult.trim().length > 0
          ? `بوابة الدفع ترد بالحالة: «${gatewayResult}». إن خُصم المبلغ من حسابك ولم يُسوَّ خلال دقائق يرجى التواصل مع مركز الخدمة.`
          : 'الدفع لم يُكمَل لدى البوابة بعد. إن كنت أتممت الدفع، انتظر دقيقة ثم أعد التحقق.';

    const share = isPaid
      ? await this.mintInvoiceShareUrlsForOrder(order.id)
      : { pdfUrl: null, shareUrl: null };
    return {
      orderId: order.id,
      status,
      isPaid,
      paid: isPaid,
      amountKd: order.totalPrice.toFixed(3),
      trackIdPresent: Boolean(returnTrack || order.posGatewayTrackId),
      gatewayResult,
      settledNow,
      messageAr,
      serialNumber: order.serialNumber ?? null,
      invoiceNumber: order.invoiceNumber ?? null,
      pdfUrl: share.pdfUrl,
      shareUrl: share.shareUrl,
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
  for (const k of [
    'trans_id',
    'transId',
    'tran_id',
    'tranId',
    'trackId',
    'track_id',
    'TrackID',
    'gateway_track_id',
  ] as const) {
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

/**
 * When `/charge` only returns `data.link` and no usable inquiry id, the URL
 * usually carries `session_id=…` / `trans_id=…` in its query. Extract it so
 * the Call Center "تحقق" button has something to pass to `get-payment-status`
 * instead of throwing "no id linked to this order".
 */
function extractUpaymentsInquiryIdFromHostedUrl(
  hostedUrl?: string | null,
): string | undefined {
  if (!hostedUrl) {
    return undefined;
  }
  const link = String(hostedUrl).trim();
  if (!link) {
    return undefined;
  }
  const KEYS = [
    'trans_id',
    'transId',
    'tran_id',
    'tranId',
    'track_id',
    'trackId',
    'TrackID',
    'session_id',
    'sessionId',
    'SessionId',
    'payment_id',
    'paymentId',
  ];
  const pick = (sp: URLSearchParams): string | undefined => {
    for (const [k, v] of sp.entries()) {
      if (
        KEYS.some((key) => key.toLowerCase() === k.toLowerCase()) &&
        v?.trim()
      ) {
        return v.trim();
      }
    }
    return undefined;
  };
  try {
    const u = new URL(link);
    const fromMain = pick(u.searchParams);
    if (fromMain && isValidUpaymentsPaymentStatusInquiryId(fromMain)) {
      return fromMain;
    }
    const h = u.hash;
    if (h && h.length > 1) {
      const inner = h.startsWith('#') ? h.slice(1) : h;
      const qMark = inner.indexOf('?');
      if (qMark >= 0) {
        const qp = new URLSearchParams(inner.slice(qMark + 1));
        const fromHash = pick(qp);
        if (fromHash && isValidUpaymentsPaymentStatusInquiryId(fromHash)) {
          return fromHash;
        }
      }
    }
  } catch {
    // fall through to regex
  }
  const m = new RegExp(
    `[?&#/](?:${KEYS.join('|')})=([^&#]+)`,
    'i',
  ).exec(link);
  if (m?.[1]) {
    let v = m[1].trim();
    try {
      v = decodeURIComponent(v);
    } catch {
      /* keep */
    }
    if (isValidUpaymentsPaymentStatusInquiryId(v)) {
      return v;
    }
  }
  return undefined;
}

function buildUpaymentsInquiryTrackCandidates(
  returnTrack: string,
  posGatewayTrackId?: string | null,
): string[] {
  const rt = typeof returnTrack === 'string' ? returnTrack.trim() : '';
  const parts = [rt, posGatewayTrackId ?? '']
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(
      (s) =>
        s.length > 0 &&
        isValidUpaymentsPaymentStatusInquiryId(s),
    );
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
    g('trans_id') ||
    g('transId') ||
    g('tran_id') ||
    g('tranId') ||
    g('track_id') ||
    g('TrackID') ||
    g('trackId') ||
    g('gateway_track_id');
  if (direct) {
    return direct;
  }
  for (const key of Object.keys(q)) {
    if (/^trans_?id$/i.test(key) || /^tran_?id$/i.test(key)) {
      const v = g(key);
      if (v) {
        return v;
      }
    }
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
    req.headers['x-gateway-trans-id'] ??
    req.headers['X-Gateway-Trans-Id'] ??
    req.headers['x-gateway-tran-id'] ??
    req.headers['X-Gateway-Tran-Id'] ??
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
  for (const param of ['trans_id', 'tran_id', 'track_id'] as const) {
    const re = new RegExp(`[?&]${param}=([^&#]+)`, 'i');
    const m = re.exec(raw);
    if (m?.[1]) {
      try {
        return decodeURIComponent(m[1].trim());
      } catch {
        return m[1].trim();
      }
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
    sp.get('trans_id')?.trim() ||
    sp.get('transId')?.trim() ||
    sp.get('tran_id')?.trim() ||
    sp.get('tranId')?.trim() ||
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
      u.searchParams.get('trans_id')?.trim() ||
      u.searchParams.get('transId')?.trim() ||
      u.searchParams.get('tran_id')?.trim() ||
      u.searchParams.get('tranId')?.trim() ||
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

function parseKwdMinor(raw: string | number | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 1000);
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
  const invoiceId = parseSafariOrderUuid(body.invoice_id);
  if (invoiceId) return invoiceId;
  const receiptId = parseSafariOrderUuid(body.receipt_id);
  if (receiptId) return receiptId;
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
