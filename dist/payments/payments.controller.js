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
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const payments_service_1 = require("../common/services/payments.service");
const payment_callback_dto_1 = require("./dto/payment-callback.dto");
class PublicOrderStatusDto {
    orderId;
    status;
    isPaid;
    amountKd;
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
    (0, swagger_1.ApiProperty)({ description: 'Amount in KWD, 3 decimals, as a string.' }),
    __metadata("design:type", String)
], PublicOrderStatusDto.prototype, "amountKd", void 0);
let PaymentsController = PaymentsController_1 = class PaymentsController {
    paymentsService;
    prisma;
    logger = new common_1.Logger(PaymentsController_1.name);
    constructor(paymentsService, prisma) {
        this.paymentsService = paymentsService;
        this.prisma = prisma;
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
        const trackId = body.trackId?.trim() ||
            body.TrackID?.trim() ||
            body.gatewayReference?.trim() ||
            '';
        if (trackId) {
            this.logger.log(`UPayments callback: received trackId prefix=${trackId.slice(0, 12)}… (inquiry next)`);
            const inquiry = await this.paymentsService.fetchGatewayStatus(trackId);
            const resolvedOrderId = inquiry.data.order?.id ??
                extractOrderIdFromExtraData(inquiry.data.customerExtraData) ??
                (await this.paymentsService.findOrderByTrackId(trackId)) ??
                extractOrderId(body) ??
                body.orderId ??
                null;
            if (!resolvedOrderId) {
                this.logger.warn(`UPayments webhook for trackId=${trackId} — cannot map to a Safari order; body=${safeJson(body)}`);
                return {
                    ok: false,
                    outcome: 'failed',
                    reason: 'order-not-found',
                };
            }
            const outcome = this.paymentsService.normalizeCallbackStatus(inquiry.data.result ?? body.result ?? body.status ?? '');
            const willFinalize = outcome === 'success' && inquiry.ok;
            this.logger.log(`UPayments callback: orderId=${resolvedOrderId} gatewayResult=${inquiry.data.result ?? 'n/a'} normalizedOutcome=${outcome} inquiryOk=${inquiry.ok} willFinalize=${willFinalize}`);
            if (willFinalize) {
                await this.paymentsService.finalizePaidOrderFromGateway(resolvedOrderId, {
                    provider: 'upayments',
                    trackId,
                    paymentId: inquiry.data.paymentId ?? body.paymentId ?? null,
                    tranId: inquiry.data.transactionId ?? body.tranId ?? null,
                    result: inquiry.data.result ?? body.result ?? null,
                    auth: body.auth ?? null,
                    amount: String(inquiry.data.amount ?? body.amount ?? ''),
                    inquiryRaw: inquiry.raw,
                    receivedBody: body,
                });
                this.logger.log(`UPayments callback: finalizePaidOrderFromGateway done orderId=${resolvedOrderId}`);
            }
            return {
                ok: true,
                orderId: resolvedOrderId,
                trackId,
                outcome,
            };
        }
        this.logger.warn(`UPayments callback: no trackId in body — keys=${Object.keys(body ?? {}).join(',') || 'empty'}; falling back to legacy HMAC (needs orderId)`);
        if (!body.orderId) {
            throw new common_1.UnauthorizedException('Callback missing trackId and orderId — cannot verify payment');
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
    async publicOrderStatus(orderId, track_id, trackID, trackIdQuery, req) {
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
                posGatewayTrackId: true,
            },
        });
        if (!order) {
            throw new common_1.BadRequestException('Order not found');
        }
        const returnTrack = pickReturnTrackIdFromRequest(track_id, trackID, trackIdQuery, req);
        let settled = Boolean(order.walletSettledAt);
        let status = order.status;
        if (!settled && status !== client_1.OrderStatus.COMPLETED) {
            const candidates = [
                ...new Set([returnTrack, order.posGatewayTrackId ?? '']
                    .map((s) => s?.trim())
                    .filter((s) => Boolean(s?.length))),
            ];
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
        return {
            orderId: order.id,
            status,
            isPaid: status === client_1.OrderStatus.COMPLETED || settled,
            amountKd: order.totalPrice.toFixed(3),
        };
    }
    async recheckPayment(orderId, track_id, trackID, trackIdQuery, req) {
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
                posGatewayTrackId: true,
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
        const returnTrack = pickReturnTrackIdFromRequest(track_id, trackID, trackIdQuery, req);
        if (!returnTrack && !order.posGatewayTrackId) {
            return {
                orderId: order.id,
                status,
                isPaid: false,
                amountKd: order.totalPrice.toFixed(3),
                trackIdPresent: false,
                gatewayResult: null,
                settledNow: false,
                messageAr: 'لا يوجد معرّف دفع مرتبط بهذا الطلب. يرجى التواصل مع مركز الخدمة.',
            };
        }
        this.logger.log(`UPayments manual recheck: orderId=${order.id} hasReturnTrack=${Boolean(returnTrack)} posTrack=${order.posGatewayTrackId ? 'yes' : 'no'}`);
        try {
            const candidates = [
                ...new Set([returnTrack, order.posGatewayTrackId ?? '']
                    .map((s) => s?.trim())
                    .filter((s) => Boolean(s?.length))),
            ];
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
                amountKd: order.totalPrice.toFixed(3),
                trackIdPresent: Boolean(returnTrack || order.posGatewayTrackId),
                gatewayResult: null,
                settledNow: false,
                messageAr: 'تعذّر الاتصال ببوابة الدفع الآن. جرّب «إعادة التحقق» مرة أخرى خلال لحظات.',
            };
        }
        const messageAr = isPaid && settledNow
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
    __param(0, (0, common_1.Param)('orderId')),
    __param(1, (0, common_1.Query)('track_id')),
    __param(2, (0, common_1.Query)('TrackID')),
    __param(3, (0, common_1.Query)('trackId')),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "publicOrderStatus", null);
__decorate([
    (0, common_1.Post)('recheck/:orderId'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({
        summary: 'Force a UPayments inquiry and finalize if CAPTURED',
        description: 'Public — for the /payment/success|failed return pages. Always calls UPayments get-payment-status. If CAPTURED the order is marked paid before responding.',
    }),
    __param(0, (0, common_1.Param)('orderId')),
    __param(1, (0, common_1.Query)('track_id')),
    __param(2, (0, common_1.Query)('TrackID')),
    __param(3, (0, common_1.Query)('trackId')),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "recheckPayment", null);
exports.PaymentsController = PaymentsController = PaymentsController_1 = __decorate([
    (0, swagger_1.ApiTags)('payments'),
    (0, common_1.Controller)('payments'),
    __metadata("design:paramtypes", [payments_service_1.PaymentsService,
        prisma_service_1.PrismaService])
], PaymentsController);
function pickReturnTrackIdFromRequest(track_id, trackID, trackIdQuery, req) {
    const fromDecorators = track_id?.trim() || trackID?.trim() || trackIdQuery?.trim() || '';
    if (fromDecorators) {
        return fromDecorators;
    }
    if (!req?.query || typeof req.query !== 'object') {
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
    const direct = g('track_id') ||
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
    return '';
}
function extractOrderIdFromExtraData(raw) {
    if (!raw)
        return null;
    const match = raw.match(/orderId=([0-9a-fA-F-]{36})/);
    return match?.[1] ?? null;
}
function extractOrderId(body) {
    if (body.orderId)
        return body.orderId;
    return extractOrderIdFromExtraData(body.customerExtraData);
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