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
var PaymentsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const customer_ledger_service_1 = require("../../customer-ledger/customer-ledger.service");
const prisma_service_1 = require("../../prisma/prisma.service");
let PaymentsService = PaymentsService_1 = class PaymentsService {
    prisma;
    customerLedger;
    logger = new common_1.Logger(PaymentsService_1.name);
    apiBase;
    apiKey;
    merchantId;
    secret;
    callbackPublicUrl;
    constructor(prisma, customerLedger) {
        this.prisma = prisma;
        this.customerLedger = customerLedger;
        this.apiBase = (process.env.PAYMENTS_API_BASE_URL ?? '').replace(/\/$/, '');
        this.apiKey = process.env.PAYMENTS_API_KEY ?? '';
        this.merchantId = process.env.PAYMENTS_MERCHANT_ID ?? '';
        this.secret = process.env.PAYMENTS_SECRET ?? '';
        this.callbackPublicUrl = (process.env.PAYMENTS_CALLBACK_PUBLIC_URL ?? '')
            .replace(/\/$/, '');
    }
    paymentsMockExplicit() {
        const m = process.env.PAYMENTS_MOCK?.trim().toLowerCase();
        return m === '1' || m === 'true' || m === 'yes';
    }
    usePlaceholderGateway() {
        return !this.apiBase.trim();
    }
    isPublicMockCheckoutAvailable() {
        return this.paymentsMockExplicit() || this.usePlaceholderGateway();
    }
    allowDevMockCallback(body) {
        return Boolean(body.devMock) && this.isPublicMockCheckoutAvailable();
    }
    async createPaymentLink(params) {
        if (this.isPublicMockCheckoutAvailable()) {
            const base = (process.env.PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
            const url = `${base}/api/payments/mock-checkout?orderId=${encodeURIComponent(params.orderId)}`;
            this.logger.log(`Mock payment link for ${params.orderId} (set PAYMENTS_API_BASE_URL for production gateway)`);
            return { url, reference: 'mock' };
        }
        if (!this.apiKey || !this.merchantId) {
            throw new common_1.ServiceUnavailableException('Payment link is not configured (PAYMENTS_API_BASE_URL, PAYMENTS_API_KEY, PAYMENTS_MERCHANT_ID)');
        }
        const callbackUrl = this.callbackPublicUrl
            ? `${this.callbackPublicUrl}/api/payments/callback`
            : `${process.env.PUBLIC_API_URL ?? 'http://localhost:3000'}/api/payments/callback`;
        const body = {
            merchantId: this.merchantId,
            reference: params.orderId,
            orderId: params.orderId,
            amount: params.amount.toFixed(4),
            currency: 'KWD',
            customerPhone: normalizeKwPhone(params.customerPhone),
            callbackUrl,
        };
        const res = await fetch(`${this.apiBase}/v1/payment-links`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.apiKey}`,
                'X-Merchant-Id': this.merchantId,
                'X-Signature': this.signPayload(JSON.stringify(body)),
            },
            body: JSON.stringify(body),
        });
        const text = await res.text();
        let json;
        try {
            json = text ? JSON.parse(text) : {};
        }
        catch {
            throw new common_1.BadRequestException('Payments gateway returned a non-JSON response');
        }
        if (!res.ok) {
            throw new common_1.BadRequestException(`Payments gateway error (${res.status}): ${text.slice(0, 500)}`);
        }
        const url = json.url ?? json.link;
        if (!url || typeof url !== 'string') {
            throw new common_1.BadRequestException('Payments gateway response missing payment URL');
        }
        return {
            url,
            reference: json.reference ?? json.id,
        };
    }
    signPayload(payload) {
        return (0, node_crypto_1.createHmac)('sha256', this.secret || this.apiKey)
            .update(payload)
            .digest('hex');
    }
    verifyIntegratedCallback(dto) {
        if (!this.secret) {
            if (process.env.NODE_ENV === 'production') {
                this.logger.error('PAYMENTS_SECRET is required in production');
                return false;
            }
            this.logger.warn('PAYMENTS_SECRET missing — callback signature not verified (dev only)');
            return true;
        }
        if (!dto.signature) {
            return false;
        }
        const payload = `${dto.orderId}|${dto.status}|${dto.amount ?? ''}`;
        const expected = (0, node_crypto_1.createHmac)('sha256', this.secret)
            .update(payload)
            .digest('hex');
        try {
            const a = Buffer.from(expected, 'utf8');
            const b = Buffer.from(dto.signature, 'utf8');
            return a.length === b.length && (0, node_crypto_1.timingSafeEqual)(a, b);
        }
        catch {
            return false;
        }
    }
    normalizeCallbackStatus(status) {
        const s = status.trim().toLowerCase();
        if (s === 'success' ||
            s === 'paid' ||
            s === 'completed' ||
            s === 'captured') {
            return 'success';
        }
        return 'failed';
    }
    async finalizePaidOrderFromGateway(referenceId) {
        const bundle = await this.prisma.posPaymentBundle.findUnique({
            where: { id: referenceId },
            include: {
                orders: {
                    where: { status: client_1.OrderStatus.PENDING },
                    orderBy: { createdAt: 'asc' },
                    select: { id: true },
                },
            },
        });
        if (bundle?.orders.length) {
            for (const o of bundle.orders) {
                await this.finalizeSinglePaidOrderFromGateway(o.id);
            }
            return;
        }
        await this.finalizeSinglePaidOrderFromGateway(referenceId);
    }
    async finalizeSinglePaidOrderFromGateway(orderId) {
        await this.prisma.$transaction(async (tx) => {
            const order = await tx.order.findUnique({
                where: { id: orderId },
                select: {
                    id: true,
                    status: true,
                    walletSettledAt: true,
                    customerId: true,
                    totalPrice: true,
                    posPaymentMethod: true,
                    driverId: true,
                },
            });
            if (!order) {
                throw new common_1.BadRequestException('Order not found');
            }
            if (order.walletSettledAt) {
                return;
            }
            if (order.status !== client_1.OrderStatus.PENDING) {
                throw new common_1.BadRequestException('Order is not awaiting gateway payment');
            }
            if (order.posPaymentMethod !== client_1.PosPaymentMethod.ONLINE &&
                order.posPaymentMethod !== client_1.PosPaymentMethod.PAYMENT_LINK) {
                throw new common_1.BadRequestException('Order is not a payment-link checkout');
            }
            const completedAt = new Date();
            await tx.order.update({
                where: { id: orderId },
                data: {
                    status: client_1.OrderStatus.COMPLETED,
                    cashStatus: client_1.CashStatus.PAID_TO_DRIVER,
                    completedAt,
                    posPaymentMethod: client_1.PosPaymentMethod.ONLINE,
                },
            });
            const performerId = order.driverId;
            if (!performerId) {
                throw new common_1.BadRequestException('Order has no driver — cannot finalize settlement');
            }
            const prefetch = {
                customerId: order.customerId,
                totalPrice: order.totalPrice,
                posPaymentMethod: order.posPaymentMethod,
                walletSettledAt: null,
                skipPerformerLookup: true,
            };
            await this.customerLedger.applyOrderWalletSettlementForCompletedOrder(tx, orderId, performerId, prefetch);
        }, { maxWait: 10_000, timeout: 15_000 });
    }
};
exports.PaymentsService = PaymentsService;
exports.PaymentsService = PaymentsService = PaymentsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        customer_ledger_service_1.CustomerLedgerService])
], PaymentsService);
function normalizeKwPhone(phone) {
    const d = phone.replace(/[\s-]/g, '').trim();
    if (d.startsWith('+')) {
        return d;
    }
    if (d.startsWith('965')) {
        return `+${d}`;
    }
    if (d.length === 8) {
        return `+965${d}`;
    }
    return d.startsWith('+') ? d : `+${d}`;
}
//# sourceMappingURL=payments.service.js.map