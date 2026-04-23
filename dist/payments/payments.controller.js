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
            if (outcome === 'success' && inquiry.ok) {
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
            }
            return {
                ok: true,
                orderId: resolvedOrderId,
                trackId,
                outcome,
            };
        }
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
    async publicOrderStatus(orderId) {
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
        let settled = Boolean(order.walletSettledAt);
        let status = order.status;
        if (!settled && status !== client_1.OrderStatus.COMPLETED && order.posGatewayTrackId) {
            try {
                const inquiry = await this.paymentsService.fetchGatewayStatus(order.posGatewayTrackId);
                const outcome = this.paymentsService.normalizeCallbackStatus(inquiry.data.result ?? '');
                if (inquiry.ok && outcome === 'success') {
                    await this.paymentsService.finalizePaidOrderFromGateway(order.id, {
                        provider: 'upayments',
                        trackId: order.posGatewayTrackId,
                        source: 'PUBLIC_STATUS_POLL',
                        paymentId: inquiry.data.paymentId ?? null,
                        tranId: inquiry.data.transactionId ?? null,
                        result: inquiry.data.result ?? null,
                        amount: String(inquiry.data.amount ?? ''),
                        inquiryRaw: inquiry.raw,
                    });
                    settled = true;
                    status = client_1.OrderStatus.COMPLETED;
                }
            }
            catch (err) {
                this.logger.warn(`Lazy reconciliation failed for order ${order.id}: ${err.message}`);
            }
        }
        return {
            orderId: order.id,
            status,
            isPaid: status === client_1.OrderStatus.COMPLETED || settled,
            amountKd: order.totalPrice.toFixed(3),
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
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "publicOrderStatus", null);
exports.PaymentsController = PaymentsController = PaymentsController_1 = __decorate([
    (0, swagger_1.ApiTags)('payments'),
    (0, common_1.Controller)('payments'),
    __metadata("design:paramtypes", [payments_service_1.PaymentsService,
        prisma_service_1.PrismaService])
], PaymentsController);
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