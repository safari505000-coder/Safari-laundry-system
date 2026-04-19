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
const general_ledger_service_1 = require("../../general-ledger/general-ledger.service");
const inventory_service_1 = require("../../inventory/inventory.service");
const prisma_service_1 = require("../../prisma/prisma.service");
let PaymentsService = PaymentsService_1 = class PaymentsService {
    prisma;
    customerLedger;
    generalLedger;
    inventory;
    logger = new common_1.Logger(PaymentsService_1.name);
    apiBase;
    apiKey;
    merchantId;
    secret;
    callbackPublicUrl;
    constructor(prisma, customerLedger, generalLedger, inventory) {
        this.prisma = prisma;
        this.customerLedger = customerLedger;
        this.generalLedger = generalLedger;
        this.inventory = inventory;
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
    async ensurePaymentLinkForUnpaidOrder(orderId) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                status: true,
                cashStatus: true,
                totalPrice: true,
                walletSettledAt: true,
                posHostedPaymentUrl: true,
                customer: { select: { phone: true, phone2: true } },
            },
        });
        if (!order) {
            throw new common_1.BadRequestException('Order not found');
        }
        if (order.status === client_1.OrderStatus.CANCELED) {
            throw new common_1.BadRequestException('Order is canceled');
        }
        if (order.cashStatus !== client_1.CashStatus.UNPAID || order.walletSettledAt) {
            throw new common_1.BadRequestException('Order is already paid');
        }
        if (order.posHostedPaymentUrl) {
            return { url: order.posHostedPaymentUrl };
        }
        const phone = order.customer.phone?.trim() || order.customer.phone2?.trim() || '';
        const link = await this.createPaymentLink({
            orderId: order.id,
            amount: order.totalPrice,
            customerPhone: phone,
        });
        await this.prisma.order.update({
            where: { id: order.id },
            data: { posHostedPaymentUrl: link.url },
        });
        return link;
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
                    cashStatus: true,
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
            if (order.status === client_1.OrderStatus.CANCELED) {
                throw new common_1.BadRequestException('Order is canceled — cannot finalize a link payment for it');
            }
            const originalMethod = order.posPaymentMethod;
            const completedAt = new Date();
            await tx.order.update({
                where: { id: orderId },
                data: {
                    status: client_1.OrderStatus.COMPLETED,
                    cashStatus: client_1.CashStatus.PAID_TO_DRIVER,
                    completedAt,
                    posPaymentMethod: client_1.PosPaymentMethod.ONLINE,
                    walletSettledAt: null,
                },
            });
            const performerId = order.driverId ?? (await this.resolveFallbackPerformer(tx));
            if (!performerId) {
                throw new common_1.BadRequestException('No performer available to attribute the link payment to');
            }
            const prefetch = {
                customerId: order.customerId,
                totalPrice: order.totalPrice,
                posPaymentMethod: client_1.PosPaymentMethod.ONLINE,
                walletSettledAt: null,
                skipPerformerLookup: true,
            };
            const extraMetadata = {
                debtSettled: order.totalPrice.toString(),
                debtSettlementViaLink: true,
                originalPaymentMethod: originalMethod ?? null,
                reportingCategory: 'DEBT_COLLECTION_VIA_LINK',
            };
            await this.customerLedger.applyOrderWalletSettlementForCompletedOrder(tx, orderId, performerId, prefetch, extraMetadata);
            await this.generalLedger.append(tx, {
                entryType: client_1.GeneralLedgerEntryType.POS_SALE_COMPLETED,
                amount: order.totalPrice,
                memo: 'POS checkout (hosted link)',
                orderId,
                customerId: order.customerId,
                actorUserId: performerId,
                metadata: {
                    posPaymentMethod: client_1.PosPaymentMethod.ONLINE,
                    originalPaymentMethod: originalMethod ?? null,
                    source: 'GATEWAY_CALLBACK',
                },
            });
            const actorRow = await tx.user.findUnique({
                where: { id: performerId },
                select: { branchId: true },
            });
            const driverRow = order.driverId
                ? await tx.user.findUnique({
                    where: { id: order.driverId },
                    select: { branchId: true },
                })
                : null;
            await this.inventory.applyOrderStockDecrement(tx, {
                orderId,
                actorUserId: performerId,
                branchId: driverRow?.branchId ?? actorRow?.branchId ?? null,
                reference: `GATEWAY-${orderId.slice(0, 8)}`,
            });
        }, { maxWait: 10_000, timeout: 15_000 });
    }
    async resolveFallbackPerformer(tx) {
        const owner = await tx.user.findFirst({
            where: { safariRole: client_1.SafariRole.OWNER },
            select: { id: true },
            orderBy: { createdAt: 'asc' },
        });
        return owner?.id ?? null;
    }
    async manuallyMarkOrderPaidByMethod(args) {
        const { orderId, method, performedByUserId } = args;
        return this.prisma.$transaction(async (tx) => {
            const order = await tx.order.findUnique({
                where: { id: orderId },
                select: {
                    id: true,
                    status: true,
                    cashStatus: true,
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
            if (order.status === client_1.OrderStatus.CANCELED) {
                throw new common_1.BadRequestException('Order is canceled — cannot mark it as paid');
            }
            if (order.walletSettledAt) {
                return {
                    orderId: order.id,
                    alreadySettled: true,
                    amountKd: order.totalPrice.toFixed(3),
                    posPaymentMethod: order.posPaymentMethod ?? client_1.PosPaymentMethod.CASH,
                };
            }
            const originalMethod = order.posPaymentMethod;
            const completedAt = new Date();
            await tx.order.update({
                where: { id: orderId },
                data: {
                    status: client_1.OrderStatus.COMPLETED,
                    cashStatus: client_1.CashStatus.PAID_TO_DRIVER,
                    completedAt,
                    posPaymentMethod: method,
                    walletSettledAt: null,
                },
            });
            const performerId = performedByUserId ??
                order.driverId ??
                (await this.resolveFallbackPerformer(tx));
            if (!performerId) {
                throw new common_1.BadRequestException('No performer available to attribute the manual settlement to');
            }
            const prefetch = {
                customerId: order.customerId,
                totalPrice: order.totalPrice,
                posPaymentMethod: method,
                walletSettledAt: null,
                skipPerformerLookup: true,
            };
            const extraMetadata = {
                debtSettled: order.totalPrice.toString(),
                debtSettlementViaCallCenter: true,
                originalPaymentMethod: originalMethod ?? null,
                confirmedPaymentMethod: method,
                reportingCategory: 'DEBT_COLLECTION_MANUAL',
            };
            await this.customerLedger.applyOrderWalletSettlementForCompletedOrder(tx, orderId, performerId, prefetch, extraMetadata);
            await this.generalLedger.append(tx, {
                entryType: client_1.GeneralLedgerEntryType.POS_SALE_COMPLETED,
                amount: order.totalPrice,
                memo: 'POS checkout (call-center manual)',
                orderId,
                customerId: order.customerId,
                actorUserId: performerId,
                metadata: {
                    posPaymentMethod: method,
                    originalPaymentMethod: originalMethod ?? null,
                    source: 'CALL_CENTER_MANUAL',
                },
            });
            const actorRow = await tx.user.findUnique({
                where: { id: performerId },
                select: { branchId: true },
            });
            const driverRow = order.driverId
                ? await tx.user.findUnique({
                    where: { id: order.driverId },
                    select: { branchId: true },
                })
                : null;
            await this.inventory.applyOrderStockDecrement(tx, {
                orderId,
                actorUserId: performerId,
                branchId: driverRow?.branchId ?? actorRow?.branchId ?? null,
                reference: `MANUAL-${orderId.slice(0, 8)}`,
            });
            return {
                orderId: order.id,
                alreadySettled: false,
                amountKd: order.totalPrice.toFixed(3),
                posPaymentMethod: method,
            };
        }, { maxWait: 10_000, timeout: 15_000 });
    }
};
exports.PaymentsService = PaymentsService;
exports.PaymentsService = PaymentsService = PaymentsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        customer_ledger_service_1.CustomerLedgerService,
        general_ledger_service_1.GeneralLedgerService,
        inventory_service_1.InventoryService])
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