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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const payments_service_1 = require("../common/services/payments.service");
const payment_callback_dto_1 = require("./dto/payment-callback.dto");
let PaymentsController = class PaymentsController {
    paymentsService;
    constructor(paymentsService) {
        this.paymentsService = paymentsService;
    }
    mockCheckoutPage(orderId, res) {
        if (!this.paymentsService.isPublicMockCheckoutAvailable()) {
            throw new common_1.NotFoundException();
        }
        if (!orderId || orderId.length < 32) {
            throw new common_1.BadRequestException('orderId query is required (UUID)');
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
    async callback(body) {
        if (!this.paymentsService.allowDevMockCallback(body) &&
            !this.paymentsService.verifyIntegratedCallback(body)) {
            throw new common_1.UnauthorizedException('Invalid or missing payment callback signature');
        }
        const outcome = this.paymentsService.normalizeCallbackStatus(body.status);
        if (outcome === 'success') {
            await this.paymentsService.finalizePaidOrderFromGateway(body.orderId);
        }
        return { ok: true, orderId: body.orderId, outcome };
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
    (0, common_1.Post)('callback'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({
        summary: 'Kuwait Gateway payment callback',
        description: 'Expects JSON with orderId, status, optional amount, and signature. On success, completes the order and runs wallet settlement.',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [payment_callback_dto_1.PaymentCallbackDto]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "callback", null);
exports.PaymentsController = PaymentsController = __decorate([
    (0, swagger_1.ApiTags)('payments'),
    (0, common_1.Controller)('payments'),
    __metadata("design:paramtypes", [payments_service_1.PaymentsService])
], PaymentsController);
//# sourceMappingURL=payments.controller.js.map