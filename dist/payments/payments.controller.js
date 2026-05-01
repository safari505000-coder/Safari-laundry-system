"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var PaymentsController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_1 = require("@nestjs/jwt");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const payments_service_1 = require("../common/services/payments.service");
const app_version_1 = require("../common/constants/app-version");
const invoice_pdf_util_1 = require("../orders/invoice-pdf.util");
const gateway_track_hint_dto_1 = require("./dto/gateway-track-hint.dto");
const payment_callback_dto_1 = require("./dto/payment-callback.dto");
class PublicOrderStatusDto {
    orderId;
    status;
    isPaid;
    paid;
    amountKd;
    serialNumber;
    invoiceNumber;
    pdfUrl;
    shareUrl;
}
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], PublicOrderStatusDto.prototype, "orderId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: [
            'PENDING',
            'PICKED_UP',
            'IN_PROGRESS',
            'OUT_FOR_DELIVERY',
            'COMPLETED',
            'CANCELED',
        ],
    }),
    __metadata("design:type", String)
], PublicOrderStatusDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'True once the gateway callback has settled the order.' }),
    __metadata("design:type", Boolean)
], PublicOrderStatusDto.prototype, "isPaid", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Alias for clients that only need { paid: boolean }.' }),
    __metadata("design:type", Boolean)
], PublicOrderStatusDto.prototype, "paid", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Amount in KWD, 3 decimals, as a string.' }),
    __metadata("design:type", String)
], PublicOrderStatusDto.prototype, "amountKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Short POS serial (e.g. "A-47"). Prefer showing this to the customer on receipts.',
        required: false,
        nullable: true,
        type: String,
    }),
    __metadata("design:type", Object)
], PublicOrderStatusDto.prototype, "serialNumber", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Back-office invoice number. Falls back to `serialNumber`.',
        required: false,
        nullable: true,
        type: String,
    }),
    __metadata("design:type", Object)
], PublicOrderStatusDto.prototype, "invoiceNumber", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'V1.7.1 — Direct PDF download URL (signed 15m token, purpose INVOICE_SHARE). Only present once `isPaid=true` and `PUBLIC_API_URL` is configured.',
        required: false,
        nullable: true,
        type: String,
    }),
    __metadata("design:type", Object)
], PublicOrderStatusDto.prototype, "pdfUrl", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'V1.7.1 — Customer-facing SPA share URL for the invoice. Only present once `isPaid=true` and `PUBLIC_WEB_APP_URL` is configured.',
        required: false,
        nullable: true,
        type: String,
    }),
    __metadata("design:type", Object)
], PublicOrderStatusDto.prototype, "shareUrl", void 0);
function mergeGatewayInquiryIdFromHintDto(hint) {
    if (!hint)
        return undefined;
    const s = hint.trans_id?.trim() ||
        hint.transId?.trim() ||
        hint.tran_id?.trim() ||
        hint.tranId?.trim() ||
        hint.trackId?.trim() ||
        hint.track_id?.trim() ||
        '';
    return s || undefined;
}
let PaymentsController = PaymentsController_1 = class PaymentsController {
    paymentsService;
    prisma;
    jwt;
    logger = new common_1.Logger(PaymentsController_1.name);
    constructor(paymentsService, prisma, jwt) {
        this.paymentsService = paymentsService;
        this.prisma = prisma;
        this.jwt = jwt;
    }
    async mintInvoiceShareUrlsForOrder(orderId) {
        try {
            const token = await this.jwt.signAsync({ purpose: 'INVOICE_SHARE', orderId }, { expiresIn: '7d' });
            const pdfUrl = (0, invoice_pdf_util_1.buildPublicInvoicePdfUrl)(token) ?? null;
            const webBase = process.env.PUBLIC_WEB_APP_URL?.trim().replace(/\/$/, '');
            const shareUrl = webBase
                ? `${webBase}/public/invoice/${encodeURIComponent(token)}`
                : null;
            return { pdfUrl, shareUrl };
        }
        catch (err) {
            this.logger.warn(`Failed to mint invoice share token for order ${orderId.slice(0, 8)}…: ${err.message}`);
            return { pdfUrl: null, shareUrl: null };
        }
    }
    mockCheckoutPage(orderId, res) {
        if (!orderId || orderId.length < 32) {
            throw new common_1.BadRequestException('orderId query is required (UUID)');
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
    mockCheckoutPageAlias(orderId, res) {
        this.mockCheckoutPage(orderId, res);
    }
    async callback(body) {
        this.logger.log(`UPayments callback received requested_order_id=${body.requested_order_id ?? 'n/a'} track_id=${body.track_id ?? body.trackId ?? body.trans_id ?? body.tran_id ?? 'n/a'} result=${body.result ?? body.status ?? 'n/a'} version=${app_version_1.APP_VERSION}`);
        if (this.paymentsService.allowDevMockCallback(body)) {
            const orderId = body.orderId ?? extractOrderId(body);
            if (!orderId) {
                throw new common_1.BadRequestException('devMock callback requires an orderId (or customerExtraData=orderId=<uuid>)');
            }
            const outcome = this.paymentsService.normalizeCallbackStatus(body.status ?? body.result ?? 'success');
            if (outcome === 'success') {
                await this.paymentsService.finalizePaidOrderFromGateway(orderId, { devMock: true, receivedBody: body });
            }
            return { ok: true, orderId, outcome };
        }
        const rawGatewayInquiryId = body.trans_id?.trim() ||
            body.transId?.trim() ||
            body.tran_id?.trim() ||
            body.tranId?.trim() ||
            body.track_id?.trim() ||
            body.trackId?.trim() ||
            body.TrackID?.trim() ||
            '';
        let gatewayInquiryId = rawGatewayInquiryId;
        if (gatewayInquiryId &&
            !(0, payments_service_1.isValidUpaymentsPaymentStatusInquiryId)(gatewayInquiryId)) {
            this.logger.warn(`UPayments callback: rejecting corrupt/oversize inquiry id from webhook (len=${gatewayInquiryId.length})`);
            gatewayInquiryId = '';
        }
        const safariForInquiryFallback = extractOrderId(body);
        if (!gatewayInquiryId && safariForInquiryFallback) {
            const row = await this.prisma.order.findUnique({
                where: { id: safariForInquiryFallback },
                select: { posGatewayTrackId: true },
            });
            const persisted = row?.posGatewayTrackId?.trim() ?? '';
            if (persisted && (0, payments_service_1.isValidUpaymentsPaymentStatusInquiryId)(persisted)) {
                gatewayInquiryId = persisted;
                this.logger.log(`UPayments callback: using Order.posGatewayTrackId from DB (webhook id missing/invalid) order=${safariForInquiryFallback.slice(0, 8)}…`);
            }
        }
        if (gatewayInquiryId) {
            this.logger.log(`UPayments callback: received payment-status id prefix=${gatewayInquiryId.slice(0, 12)}…`);
            const inquiry = await this.paymentsService.fetchGatewayStatus(gatewayInquiryId);
            const safariOrderFromBody = extractOrderId(body);
            const linkedOrderId = await this.paymentsService.findOrderByTrackId(gatewayInquiryId);
            const inquiryOrderId = parseSafariOrderUuid(inquiry.data.order?.id) ??
                extractOrderIdFromExtraData(inquiry.data.customerExtraData) ??
                tryOrderIdFromUpaymentsCompactRef(inquiry.data.order?.reference) ??
                tryOrderIdFromUpaymentsCompactRef(inquiry.data.reference);
            const resolvedOrderId = inquiryOrderId ??
                linkedOrderId ??
                safariOrderFromBody ??
                null;
            if (!resolvedOrderId) {
                this.logger.warn(`UPayments webhook for gatewayInquiryId=${gatewayInquiryId} — cannot map to a Safari order; body=${safeJson(body)}`);
                return {
                    ok: true,
                    outcome: 'failed',
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
                this.logger.warn(`UPayments callback: resolved order does not exist orderId=${resolvedOrderId} trackIdPrefix=${gatewayInquiryId.slice(0, 16)}`);
                return {
                    ok: true,
                    orderId: resolvedOrderId,
                    trackId: gatewayInquiryId,
                    outcome: 'failed',
                    reason: 'order-not-found',
                };
            }
            if (inquiryOrderId && inquiryOrderId !== order.id) {
                this.logger.warn(`UPayments callback: gateway order mismatch inquiryOrder=${inquiryOrderId} resolvedOrder=${order.id} trackIdPrefix=${gatewayInquiryId.slice(0, 16)}`);
                return {
                    ok: true,
                    orderId: order.id,
                    trackId: gatewayInquiryId,
                    outcome: 'failed',
                    reason: 'order-mismatch',
                };
            }
            if (linkedOrderId && linkedOrderId !== order.id) {
                this.logger.warn(`UPayments callback: stored track/order mismatch linkedOrder=${linkedOrderId} resolvedOrder=${order.id} trackIdPrefix=${gatewayInquiryId.slice(0, 16)}`);
                return {
                    ok: true,
                    orderId: order.id,
                    trackId: gatewayInquiryId,
                    outcome: 'failed',
                    reason: 'track-order-mismatch',
                };
            }
            const outcome = this.paymentsService.normalizeCallbackStatus(inquiry.data.result ?? '');
            let willFinalize = outcome === 'success' && inquiry.ok;
            const gatewayAmountMinor = parseKwdMinor(inquiry.data.amount);
            const orderAmountMinor = parseKwdMinor(order.totalPrice.toString());
            let blockedReason = null;
            if (willFinalize && gatewayAmountMinor === null) {
                willFinalize = false;
                blockedReason = 'amount-missing';
                this.logger.warn(`UPayments callback: gateway success without amount; not finalizing orderId=${order.id} trackIdPrefix=${gatewayInquiryId.slice(0, 16)}`);
            }
            else if (willFinalize &&
                orderAmountMinor !== null &&
                gatewayAmountMinor !== orderAmountMinor) {
                willFinalize = false;
                blockedReason = 'amount-mismatch';
                this.logger.warn(`UPayments callback: amount mismatch orderId=${order.id} expectedMinor=${orderAmountMinor} gatewayMinor=${gatewayAmountMinor} trackIdPrefix=${gatewayInquiryId.slice(0, 16)}`);
            }
            this.logger.log(`UPayments callback: orderId=${order.id} gatewayResult=${inquiry.data.result ?? 'n/a'} normalizedOutcome=${outcome} inquiryOk=${inquiry.ok} willFinalize=${willFinalize}${blockedReason ? ` blockedReason=${blockedReason}` : ''}`);
            if (willFinalize &&
                (order.walletSettledAt || order.status === client_1.OrderStatus.COMPLETED)) {
                willFinalize = false;
                this.logger.log(`UPayments callback: duplicate/no-op order already settled orderId=${order.id}`);
            }
            else if (willFinalize) {
                this.logger.log(`about_to_finalize orderId=${order.id} source=UPAYMENTS_CALLBACK trackId=${gatewayInquiryId} version=${app_version_1.APP_VERSION}`);
                await this.paymentsService.finalizePaidOrderFromGateway(order.id, {
                    provider: 'upayments',
                    trackId: gatewayInquiryId,
                    paymentId: inquiry.data.paymentId ??
                        body.paymentId ??
                        body.payment_id ??
                        null,
                    tranId: inquiry.data.transactionId ??
                        body.tranId ??
                        body.tran_id ??
                        null,
                    result: inquiry.data.result ?? body.result ?? null,
                    auth: body.auth ?? null,
                    amount: String(inquiry.data.amount ?? body.amount ?? ''),
                    inquiryRaw: inquiry.raw,
                    receivedBody: body,
                });
                this.logger.log(`UPayments callback: verified finalize done orderId=${order.id}`);
            }
            if (!willFinalize && outcome === 'success') {
                this.logger.warn(`UPayments callback: gateway outcome success but Safari order NOT finalized — invoice may remain unpaid pending manual reconcile orderId=${order.id} trackIdPrefix=${gatewayInquiryId.slice(0, 16)}${blockedReason ? ` reason=${blockedReason}` : ''}`);
            }
            return {
                ok: true,
                orderId: order.id,
                trackId: gatewayInquiryId,
                outcome: willFinalize ||
                    order.walletSettledAt ||
                    order.status === client_1.OrderStatus.COMPLETED
                    ? 'success'
                    : outcome,
                ...(blockedReason ? { reason: blockedReason } : {}),
            };
        }
        this.logger.warn(`UPayments callback: no payment-status inquiry id (trans_id / tran_id / track_id) in body — keys=${Object.keys(body ?? {}).join(',') || 'empty'}; falling back to legacy HMAC (needs orderId)`);
        if (!body.orderId) {
            throw new common_1.UnauthorizedException('Callback missing payment-status inquiry id (trans_id / tran_id / track_id) and orderId — cannot verify payment');
        }
        if (!this.paymentsService.verifyIntegratedCallback({
            orderId: body.orderId,
            status: body.status ?? body.result ?? '',
            amount: body.amount,
            signature: body.signature,
        })) {
            throw new common_1.UnauthorizedException('Invalid or missing payment callback signature');
        }
        const outcome = this.paymentsService.normalizeCallbackStatus(body.status ?? body.result ?? '');
        if (outcome === 'success') {
            await this.paymentsService.finalizePaidOrderFromGateway(body.orderId, { provider: 'legacy-hmac', receivedBody: body });
        }
        return { ok: true, orderId: body.orderId, outcome };
    }
    async publicOrderStatusGet(req, orderId, track_id, trackID, trackIdQuery, gatewayResultQuery) {
        return this.runPublicOrderStatusPoll(orderId, req, track_id, trackID, trackIdQuery, undefined, undefined, gatewayResultQuery);
    }
    async publicOrderStatusPost(req, orderId, body, track_id, trackID, trackIdQuery, gatewayResultQuery) {
        return this.runPublicOrderStatusPoll(orderId, req, track_id, trackID, trackIdQuery, mergeGatewayInquiryIdFromHintDto(body), body?.result, gatewayResultQuery);
    }
    async runPublicOrderStatusPoll(orderId, req, track_id, trackID, trackIdQuery, bodyTrackId, gatewayResultFromBody, gatewayResultQuery) {
        if (!orderId || orderId.length < 32) {
            throw new common_1.BadRequestException('orderId is required (UUID)');
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
            throw new common_1.BadRequestException('Order not found');
        }
        let returnTrack = pickReturnTrackIdFromRequest(bodyTrackId, track_id, trackID, trackIdQuery, req);
        if (returnTrack && !(0, payments_service_1.isValidUpaymentsPaymentStatusInquiryId)(returnTrack)) {
            this.logger.warn(`Ignoring invalid payment-status inquiry hint from return URL/body (len=${returnTrack.length}) order=${order.id.slice(0, 8)}…`);
            returnTrack = '';
        }
        const urlTrackFallback = extractUpaymentsInquiryIdFromHostedUrl(order.posHostedPaymentUrl);
        const gatewayResultRaw = pickGatewayReturnResultFromRequest(gatewayResultFromBody, gatewayResultQuery, req);
        let settled = Boolean(order.walletSettledAt);
        let status = order.status;
        if (!settled && status !== client_1.OrderStatus.COMPLETED) {
            if (gatewayResultRaw && returnTrack) {
                try {
                    const tr = await this.paymentsService.tryFinalizeOrderFromTrustedUpaymentsReturn(order.id, returnTrack, gatewayResultRaw, 'PUBLIC_STATUS_POLL_TRUSTED_RETURN_URL');
                    if (tr.finalized) {
                        settled = true;
                        status = client_1.OrderStatus.COMPLETED;
                    }
                }
                catch (err) {
                    this.logger.warn(`Trusted return-url finalize failed for order ${order.id}: ${err.message}`);
                }
            }
        }
        if (!settled && status !== client_1.OrderStatus.COMPLETED) {
            const candidates = buildUpaymentsInquiryTrackCandidates(returnTrack, order.posGatewayTrackId ?? urlTrackFallback ?? null);
            for (const tid of candidates) {
                try {
                    const r = await this.paymentsService.tryFinalizeOrderIfUpaymentsCaptured(order.id, tid, tid === returnTrack
                        ? 'PUBLIC_STATUS_POLL_RETURN_TRACK'
                        : 'PUBLIC_STATUS_POLL');
                    if (r.finalized) {
                        settled = true;
                        status = client_1.OrderStatus.COMPLETED;
                        break;
                    }
                }
                catch (err) {
                    this.logger.warn(`Lazy reconciliation failed for order ${order.id}: ${err.message}`);
                }
            }
        }
        const isPaid = status === client_1.OrderStatus.COMPLETED || settled;
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
    async recheckPaymentPost(req, orderId, body, track_id, trackID, trackIdQuery, gatewayResultQuery) {
        return this.runRecheckPayment(req, orderId, body, {
            track_id,
            trackID,
            trackIdQuery,
            gatewayResultQuery,
        });
    }
    async recheckPaymentGet(req, orderId, track_id, trackID, trackIdQuery, gatewayResultQuery) {
        return this.runRecheckPayment(req, orderId, undefined, {
            track_id,
            trackID,
            trackIdQuery,
            gatewayResultQuery,
        });
    }
    async runRecheckPayment(req, orderId, bodyHint, q) {
        if (!orderId || orderId.length < 32) {
            throw new common_1.BadRequestException('orderId is required (UUID)');
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
            throw new common_1.BadRequestException('Order not found');
        }
        let status = order.status;
        let isPaid = status === client_1.OrderStatus.COMPLETED || Boolean(order.walletSettledAt);
        let gatewayResult = null;
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
        let returnTrack = pickReturnTrackIdFromRequest(mergeGatewayInquiryIdFromHintDto(bodyHint), q.track_id, q.trackID, q.trackIdQuery, req);
        if (returnTrack && !(0, payments_service_1.isValidUpaymentsPaymentStatusInquiryId)(returnTrack)) {
            this.logger.warn(`Recheck: ignoring invalid inquiry hint (len=${returnTrack.length}) order=${orderId.slice(0, 8)}…`);
            returnTrack = '';
        }
        const gatewayResultRaw = pickGatewayReturnResultFromRequest(bodyHint?.result, q.gatewayResultQuery, req);
        if (!isPaid && gatewayResultRaw && returnTrack) {
            try {
                const tr = await this.paymentsService.tryFinalizeOrderFromTrustedUpaymentsReturn(order.id, returnTrack, gatewayResultRaw, 'CUSTOMER_RECHECK_TRUSTED_RETURN_URL');
                if (tr.finalized) {
                    this.logger.log(`UPayments manual recheck: finalized (trusted return URL) orderId=${order.id}`);
                    const share = await this.mintInvoiceShareUrlsForOrder(order.id);
                    return {
                        orderId: order.id,
                        status: client_1.OrderStatus.COMPLETED,
                        isPaid: true,
                        paid: true,
                        amountKd: order.totalPrice.toFixed(3),
                        trackIdPresent: true,
                        gatewayResult: gatewayResultRaw,
                        settledNow: true,
                        messageAr: 'تم تأكيد الدفع بنجاح ✅ — تم تحديث الفاتورة في النظام.',
                        serialNumber: order.serialNumber ?? null,
                        invoiceNumber: order.invoiceNumber ?? null,
                        pdfUrl: share.pdfUrl,
                        shareUrl: share.shareUrl,
                    };
                }
            }
            catch (err) {
                this.logger.warn(`Trusted recheck finalize failed orderId=${order.id}: ${err.message}`);
            }
        }
        const urlTrackFallback = extractUpaymentsInquiryIdFromHostedUrl(order.posHostedPaymentUrl);
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
                messageAr: 'الدفع لم يُكمَل لدى البوابة بعد. إن كنت أتممت الدفع، انتظر دقيقة ثم أعد التحقق.',
                serialNumber: order.serialNumber ?? null,
                invoiceNumber: order.invoiceNumber ?? null,
                pdfUrl: null,
                shareUrl: null,
            };
        }
        this.logger.log(`UPayments manual recheck: orderId=${order.id} hasReturnTrack=${Boolean(returnTrack)} posTrack=${order.posGatewayTrackId ? 'yes' : 'no'} urlTrack=${urlTrackFallback ? 'yes' : 'no'}`);
        try {
            const candidates = buildUpaymentsInquiryTrackCandidates(returnTrack, order.posGatewayTrackId ?? urlTrackFallback ?? null);
            for (const tid of candidates) {
                const r = await this.paymentsService.tryFinalizeOrderIfUpaymentsCaptured(order.id, tid, tid === returnTrack
                    ? 'CUSTOMER_RECHECK_RETURN_TRACK'
                    : 'CUSTOMER_RECHECK');
                gatewayResult = r.gatewayResult;
                if (r.finalized) {
                    status = client_1.OrderStatus.COMPLETED;
                    isPaid = true;
                    settledNow = true;
                    this.logger.log(`UPayments manual recheck: finalized orderId=${order.id}`);
                    break;
                }
            }
        }
        catch (err) {
            this.logger.warn(`UPayments manual recheck error orderId=${order.id}: ${err.message}`);
            return {
                orderId: order.id,
                status,
                isPaid: false,
                paid: false,
                amountKd: order.totalPrice.toFixed(3),
                trackIdPresent: Boolean(returnTrack || order.posGatewayTrackId),
                gatewayResult: null,
                settledNow: false,
                messageAr: 'تعذّر الاتصال ببوابة الدفع الآن. جرّب «إعادة التحقق» مرة أخرى خلال لحظات.',
                serialNumber: order.serialNumber ?? null,
                invoiceNumber: order.invoiceNumber ?? null,
                pdfUrl: null,
                shareUrl: null,
            };
        }
        const messageAr = isPaid && settledNow
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
};
exports.PaymentsController = PaymentsController;
__decorate([
    (0, common_1.Get)('mock-checkout'),
    (0, swagger_1.ApiExcludeEndpoint)(),
    __param(0, (0, common_1.Query)('orderId')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], PaymentsController.prototype, "mockCheckoutPage", null);
__decorate([
    (0, common_1.Get)('mock/checkout'),
    (0, swagger_1.ApiExcludeEndpoint)(),
    __param(0, (0, common_1.Query)('orderId')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], PaymentsController.prototype, "mockCheckoutPageAlias", null);
__decorate([
    (0, common_1.Post)('callback'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({
        summary: 'UPayments payment notification webhook',
        description: 'Server-side verification via `GET /api/v1/get-payment-status/{trackId}`. Legacy HMAC signatures and devMock are also accepted for non-UPayments gateways and local testing.',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [payment_callback_dto_1.PaymentCallbackDto]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "callback", null);
__decorate([
    (0, common_1.Get)('status/:orderId'),
    (0, swagger_1.ApiOperation)({
        summary: 'Public order payment status (for customer return pages)',
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('orderId')),
    __param(2, (0, common_1.Query)('track_id')),
    __param(3, (0, common_1.Query)('TrackID')),
    __param(4, (0, common_1.Query)('trackId')),
    __param(5, (0, common_1.Query)('result')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "publicOrderStatusGet", null);
__decorate([
    (0, common_1.Post)('status/:orderId'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({
        summary: 'Public order payment status (POST — trackId in JSON when query is stripped)',
    }),
    (0, swagger_1.ApiBody)({ type: gateway_track_hint_dto_1.GatewayTrackHintDto, required: false }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('orderId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Query)('track_id')),
    __param(4, (0, common_1.Query)('TrackID')),
    __param(5, (0, common_1.Query)('trackId')),
    __param(6, (0, common_1.Query)('result')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, gateway_track_hint_dto_1.GatewayTrackHintDto, String, String, String, String]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "publicOrderStatusPost", null);
__decorate([
    (0, common_1.Post)('recheck/:orderId'),
    (0, common_1.HttpCode)(200),
    (0, common_1.Header)('Cache-Control', 'no-store'),
    (0, swagger_1.ApiOperation)({
        summary: 'Force payment verification and finalize if CAPTURED (POST)',
        description: 'Public — optional JSON body with trackId when query string was stripped.',
    }),
    (0, swagger_1.ApiBody)({ type: gateway_track_hint_dto_1.GatewayTrackHintDto, required: false }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('orderId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Query)('track_id')),
    __param(4, (0, common_1.Query)('TrackID')),
    __param(5, (0, common_1.Query)('trackId')),
    __param(6, (0, common_1.Query)('result')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, gateway_track_hint_dto_1.GatewayTrackHintDto, String, String, String, String]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "recheckPaymentPost", null);
__decorate([
    (0, common_1.Get)('recheck/:orderId'),
    (0, common_1.HttpCode)(200),
    (0, common_1.Header)('Cache-Control', 'no-store'),
    (0, swagger_1.ApiOperation)({
        summary: 'Force payment verification and finalize if CAPTURED (GET)',
        description: 'Same as POST — use when the SPA origin cannot POST to the API (static hosting / mis-proxy). Pass track_id and result as query params when available.',
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('orderId')),
    __param(2, (0, common_1.Query)('track_id')),
    __param(3, (0, common_1.Query)('TrackID')),
    __param(4, (0, common_1.Query)('trackId')),
    __param(5, (0, common_1.Query)('result')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "recheckPaymentGet", null);
exports.PaymentsController = PaymentsController = PaymentsController_1 = __decorate([
    (0, swagger_1.ApiTags)('payments'),
    (0, common_1.Controller)('payments'),
    __metadata("design:paramtypes", [payments_service_1.PaymentsService,
        prisma_service_1.PrismaService,
        jwt_1.JwtService])
], PaymentsController);
function readGatewayTrackIdFromPlainBody(req) {
    const raw = req.body;
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
        return '';
    }
    const o = raw;
    for (const k of [
        'trans_id',
        'transId',
        'tran_id',
        'tranId',
        'trackId',
        'track_id',
        'TrackID',
        'gateway_track_id',
    ]) {
        const v = o[k];
        if (typeof v === 'string' && v.trim()) {
            return v.trim();
        }
    }
    return '';
}
function upaymentTrackInquirySortKey(tid) {
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
function extractUpaymentsInquiryIdFromHostedUrl(hostedUrl) {
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
    const pick = (sp) => {
        for (const [k, v] of sp.entries()) {
            if (KEYS.some((key) => key.toLowerCase() === k.toLowerCase()) &&
                v?.trim()) {
                return v.trim();
            }
        }
        return undefined;
    };
    try {
        const u = new URL(link);
        const fromMain = pick(u.searchParams);
        if (fromMain && (0, payments_service_1.isValidUpaymentsPaymentStatusInquiryId)(fromMain)) {
            return fromMain;
        }
        const h = u.hash;
        if (h && h.length > 1) {
            const inner = h.startsWith('#') ? h.slice(1) : h;
            const qMark = inner.indexOf('?');
            if (qMark >= 0) {
                const qp = new URLSearchParams(inner.slice(qMark + 1));
                const fromHash = pick(qp);
                if (fromHash && (0, payments_service_1.isValidUpaymentsPaymentStatusInquiryId)(fromHash)) {
                    return fromHash;
                }
            }
        }
    }
    catch {
    }
    const m = new RegExp(`[?&#/](?:${KEYS.join('|')})=([^&#]+)`, 'i').exec(link);
    if (m?.[1]) {
        let v = m[1].trim();
        try {
            v = decodeURIComponent(v);
        }
        catch {
        }
        if ((0, payments_service_1.isValidUpaymentsPaymentStatusInquiryId)(v)) {
            return v;
        }
    }
    return undefined;
}
function buildUpaymentsInquiryTrackCandidates(returnTrack, posGatewayTrackId) {
    const rt = typeof returnTrack === 'string' ? returnTrack.trim() : '';
    const parts = [rt, posGatewayTrackId ?? '']
        .map((s) => (typeof s === 'string' ? s.trim() : ''))
        .filter((s) => s.length > 0 &&
        (0, payments_service_1.isValidUpaymentsPaymentStatusInquiryId)(s));
    const unique = [...new Set(parts)];
    const filtered = rt && /v2$/i.test(rt)
        ? unique.filter((t) => !/^\d{18,}$/.test(t.trim()))
        : unique;
    const list = filtered.length > 0 ? filtered : unique;
    list.sort((a, b) => upaymentTrackInquirySortKey(a) - upaymentTrackInquirySortKey(b));
    return list;
}
function pickReturnTrackIdFromRequest(bodyTrackId, track_id, trackID, trackIdQuery, req) {
    const fromPlainBody = readGatewayTrackIdFromPlainBody(req);
    if (fromPlainBody) {
        return fromPlainBody;
    }
    const fromBody = bodyTrackId?.trim();
    if (fromBody) {
        return fromBody;
    }
    const fromDecorators = track_id?.trim() || trackID?.trim() || trackIdQuery?.trim() || '';
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
    const q = req.query;
    const g = (key) => {
        const v = q[key];
        if (v === undefined) {
            return '';
        }
        if (Array.isArray(v)) {
            return (v[0] ?? '').trim();
        }
        return String(v).trim();
    };
    const direct = g('trans_id') ||
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
function normalizeAmpInQueryString(qs) {
    return qs.replace(/&amp;/gi, '&').replace(/%26amp%3B/gi, '&');
}
function readGatewayTrackIdFromRequestHeaders(req) {
    const raw = req.headers['x-gateway-trans-id'] ??
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
function extractTrackIdFromRequestUrl(req) {
    let raw = (typeof req.originalUrl === 'string' && req.originalUrl.length > 0
        ? req.originalUrl
        : null) ??
        (typeof req.url === 'string' && req.url.length > 0 ? req.url : '') ??
        '';
    raw = normalizeAmpInQueryString(raw);
    try {
        raw = decodeURIComponent(raw);
    }
    catch {
    }
    for (const param of ['trans_id', 'tran_id', 'track_id']) {
        const re = new RegExp(`[?&]${param}=([^&#]+)`, 'i');
        const m = re.exec(raw);
        if (m?.[1]) {
            try {
                return decodeURIComponent(m[1].trim());
            }
            catch {
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
    return (sp.get('trans_id')?.trim() ||
        sp.get('transId')?.trim() ||
        sp.get('tran_id')?.trim() ||
        sp.get('tranId')?.trim() ||
        sp.get('track_id')?.trim() ||
        sp.get('TrackID')?.trim() ||
        sp.get('trackId')?.trim() ||
        '');
}
function readGatewayResultFromPlainBody(req) {
    const raw = req.body;
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
        return '';
    }
    const o = raw;
    const v = o.result ?? o.Result;
    if (typeof v === 'string' && v.trim()) {
        return v.trim();
    }
    return '';
}
function extractGatewayResultFromRequestUrl(req) {
    let raw = (typeof req.originalUrl === 'string' && req.originalUrl.length > 0
        ? req.originalUrl
        : null) ??
        (typeof req.url === 'string' && req.url.length > 0 ? req.url : '') ??
        '';
    raw = normalizeAmpInQueryString(raw);
    try {
        raw = decodeURIComponent(raw);
    }
    catch {
    }
    const m = /[?&]result=([^&#]+)/i.exec(raw);
    if (m?.[1]) {
        try {
            return decodeURIComponent(m[1].trim());
        }
        catch {
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
function pickGatewayReturnResultFromRequest(bodyResult, resultQuery, req) {
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
function extractPaymentReturnHintsFromReferer(req) {
    const header = (typeof req.get === 'function' && req.get('referer')) ||
        (typeof req.get === 'function' && req.get('referrer')) ||
        req.headers['referer'] ||
        req.headers['referrer'] ||
        '';
    if (!header || typeof header !== 'string') {
        return { trackId: '', result: '' };
    }
    try {
        const u = new URL(header);
        const trackId = u.searchParams.get('trans_id')?.trim() ||
            u.searchParams.get('transId')?.trim() ||
            u.searchParams.get('tran_id')?.trim() ||
            u.searchParams.get('tranId')?.trim() ||
            u.searchParams.get('track_id')?.trim() ||
            u.searchParams.get('TrackID')?.trim() ||
            u.searchParams.get('trackId')?.trim() ||
            '';
        const result = u.searchParams.get('result')?.trim() ||
            u.searchParams.get('Result')?.trim() ||
            '';
        return { trackId, result };
    }
    catch {
        return { trackId: '', result: '' };
    }
}
const SAFARI_ORDER_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function parseSafariOrderUuid(raw) {
    const t = raw?.trim();
    if (!t)
        return null;
    return SAFARI_ORDER_UUID_RE.test(t) ? t : null;
}
function parseKwdMinor(raw) {
    if (raw === undefined || raw === null)
        return null;
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(value))
        return null;
    return Math.round(value * 1000);
}
function extractOrderIdFromExtraData(raw) {
    if (!raw)
        return null;
    const match = raw.match(/orderId=([0-9a-fA-F-]{36})/i);
    const id = match?.[1];
    return id && SAFARI_ORDER_UUID_RE.test(id) ? id : null;
}
function extractOrderIdFromTrnUdf(raw) {
    if (!raw)
        return null;
    const match = raw.match(/orderId=([0-9a-fA-F-]{36})/i);
    const id = match?.[1];
    return id && SAFARI_ORDER_UUID_RE.test(id) ? id : null;
}
function tryOrderIdFromUpaymentsCompactRef(raw) {
    const t = raw?.trim();
    if (!t)
        return null;
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
function extractOrderId(body) {
    const legacy = parseSafariOrderUuid(body.orderId);
    if (legacy)
        return legacy;
    const requested = parseSafariOrderUuid(body.requested_order_id);
    if (requested)
        return requested;
    const gatewayOid = parseSafariOrderUuid(body.order_id);
    if (gatewayOid)
        return gatewayOid;
    const invoiceId = parseSafariOrderUuid(body.invoice_id);
    if (invoiceId)
        return invoiceId;
    const receiptId = parseSafariOrderUuid(body.receipt_id);
    if (receiptId)
        return receiptId;
    const fromRef = tryOrderIdFromUpaymentsCompactRef(body.ref) ??
        tryOrderIdFromUpaymentsCompactRef(body.reference);
    if (fromRef)
        return fromRef;
    return (extractOrderIdFromExtraData(body.customerExtraData) ??
        extractOrderIdFromTrnUdf(body.trn_udf));
}
function safeJson(value) {
    try {
        return JSON.stringify(value).slice(0, 400);
    }
    catch {
        return '[unserializable]';
    }
}
//# sourceMappingURL=payments.controller.js.map