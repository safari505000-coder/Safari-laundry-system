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
const customer_notifications_service_1 = require("../../customer-notifications/customer-notifications.service");
const general_ledger_service_1 = require("../../general-ledger/general-ledger.service");
const inventory_service_1 = require("../../inventory/inventory.service");
const prisma_service_1 = require("../../prisma/prisma.service");
const kuwait_customer_phone_1 = require("../validation/kuwait-customer-phone");
const cash_status_for_method_1 = require("../utils/cash-status-for-method");
let PaymentsService = PaymentsService_1 = class PaymentsService {
    prisma;
    customerLedger;
    generalLedger;
    inventory;
    customerNotifications;
    logger = new common_1.Logger(PaymentsService_1.name);
    prodFirstMockLinkLogged = false;
    apiBase;
    apiKey;
    merchantId;
    secret;
    callbackPublicUrl;
    webAppUrl;
    constructor(prisma, customerLedger, generalLedger, inventory, customerNotifications) {
        this.prisma = prisma;
        this.customerLedger = customerLedger;
        this.generalLedger = generalLedger;
        this.inventory = inventory;
        this.customerNotifications = customerNotifications;
        this.apiBase = (process.env.PAYMENTS_API_BASE_URL ?? '').replace(/\/$/, '');
        this.apiKey = process.env.PAYMENTS_API_KEY ?? '';
        this.merchantId = process.env.PAYMENTS_MERCHANT_ID ?? '';
        this.secret = process.env.PAYMENTS_SECRET ?? '';
        this.callbackPublicUrl = (process.env.PAYMENTS_CALLBACK_PUBLIC_URL ?? '')
            .replace(/\/$/, '');
        this.webAppUrl = (process.env.PUBLIC_WEB_APP_URL ?? 'http://localhost:5173').replace(/\/$/, '');
    }
    onModuleInit() {
        if (this.isPublicMockCheckoutAvailable()) {
            const inProd = process.env.NODE_ENV === 'production';
            if (inProd) {
                this.logger.warn('PAYMENTS: mock checkout is active in production — links go to /api/payments/mock-checkout, not UPayments. Set PAYMENTS_API_BASE_URL (e.g. https://apiv2api.upayments.com), PAYMENTS_API_KEY, PAYMENTS_CALLBACK_PUBLIC_URL, ensure PAYMENTS_MOCK is not true, then redeploy.');
            }
            else {
                this.logger.log('PAYMENTS: mock / dev link mode (set PAYMENTS_API_BASE_URL for real UPayments).');
            }
        }
        else if (!this.apiKey.trim()) {
            this.logger.warn('PAYMENTS: PAYMENTS_API_KEY is empty — /charge will fail when creating payment links.');
        }
        else {
            this.logger.log('PAYMENTS: UPayments hosted links enabled.');
        }
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
            if (process.env.NODE_ENV === 'production' && !this.prodFirstMockLinkLogged) {
                this.prodFirstMockLinkLogged = true;
                this.logger.warn('PAYMENTS: ONLINE order uses mock payment URL — set PAYMENTS_API_BASE_URL and PAYMENTS_API_KEY on the host; unset PAYMENTS_MOCK. (This banner once; each order still logs below.)');
            }
            this.logger.log(`Mock payment link for ${params.orderId} (set PAYMENTS_API_BASE_URL for UPayments)`);
            return { url, reference: 'mock', trackId: `mock-${params.orderId}` };
        }
        if (!this.apiKey) {
            throw new common_1.ServiceUnavailableException('Payment link is not configured (PAYMENTS_API_KEY missing)');
        }
        const notificationUrl = this.callbackPublicUrl
            ? `${this.callbackPublicUrl}/api/payments/callback`
            : `${process.env.PUBLIC_API_URL ?? 'http://localhost:3000'}/api/payments/callback`;
        const returnUrl = `${this.webAppUrl}/payment/success?orderId=${encodeURIComponent(params.orderId)}`;
        const cancelUrl = `${this.webAppUrl}/payment/failed?orderId=${encodeURIComponent(params.orderId)}`;
        const amount = Number(params.amount.toFixed(3));
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new common_1.BadRequestException('Invalid order amount for payment link');
        }
        const customerName = (params.customerName?.trim() || 'Safari Customer').slice(0, 100);
        const customerEmail = (params.customerEmail?.trim() ||
            `noreply+${params.orderId.slice(0, 8)}@safariomni.com`).slice(0, 120);
        const customerMobile = normalizeKwPhone(params.customerPhone || '');
        const customerUniqueId = (params.customerUniqueId?.trim() || params.orderId).slice(0, 20);
        const customerExtraData = `orderId=${params.orderId}`;
        const body = {
            products: [
                {
                    name: 'Safari Omni Order',
                    description: `Order ${params.orderId.slice(0, 8)}`,
                    price: amount,
                    quantity: 1,
                },
            ],
            order: {
                id: params.orderId,
                reference: params.orderId.slice(0, 30),
                description: 'Safari Omni order payment',
                currency: 'KWD',
                amount,
            },
            paymentGateway: { src: '' },
            language: 'en',
            reference: { id: `o${params.orderId.replace(/-/g, '')}`.slice(0, 35) },
            customer: {
                uniqueId: customerUniqueId,
                name: customerName,
                email: customerEmail,
                mobile: customerMobile,
            },
            returnUrl,
            cancelUrl,
            notificationUrl,
            customerExtraData,
            paymentLinkExpiryInMinutes: 60 * 24,
        };
        const chargeUrl = `${this.apiBase}/api/v1/charge`;
        this.logger.log(`UPayments /charge → ${chargeUrl} (order=${params.orderId}, amount=${amount})`);
        const upaymentsFetchTimeoutMs = Number(process.env.PAYMENTS_UPAYMENTS_TIMEOUT_MS?.trim() || '60000');
        let res;
        try {
            res = await fetch(chargeUrl, {
                method: 'POST',
                signal: AbortSignal.timeout(Number.isFinite(upaymentsFetchTimeoutMs) && upaymentsFetchTimeoutMs > 0
                    ? upaymentsFetchTimeoutMs
                    : 60_000),
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify(body),
            });
        }
        catch (e) {
            const root = e instanceof Error && e.cause
                ? String(e.cause)
                : '';
            const msg = e instanceof Error ? `${e.message}${root ? ` ${root}` : ''}` : String(e);
            this.logger.error(`UPayments /charge fetch failed: ${msg}`);
            throw new common_1.ServiceUnavailableException('Cannot reach UPayments (network error or timeout). Check internet, firewall, and PAYMENTS_API_BASE_URL. For local dev without gateway access, set PAYMENTS_MOCK=true in .env.');
        }
        const text = await res.text();
        let json;
        try {
            json = text ? JSON.parse(text) : {};
        }
        catch {
            this.logger.error(`UPayments non-JSON response (status=${res.status}, ct=${res.headers.get('content-type')}): ${text.slice(0, 300)}`);
            throw new common_1.BadRequestException('UPayments gateway returned a non-JSON response');
        }
        if (!res.ok || json.status === false) {
            const msg = json.message ?? text.slice(0, 500);
            this.logger.error(`UPayments /charge failed (${res.status}) for ${params.orderId}: ${msg}`);
            throw new common_1.BadRequestException(`Payments gateway error (${res.status}): ${msg}`);
        }
        const url = json.data?.link;
        const trackId = json.data?.trackId;
        if (!url || typeof url !== 'string') {
            throw new common_1.BadRequestException('UPayments response missing `data.link`');
        }
        return {
            url,
            reference: trackId,
            trackId: trackId ?? undefined,
        };
    }
    async fetchGatewayStatus(trackId) {
        if (this.usePlaceholderGateway()) {
            return { ok: false, data: {}, raw: null };
        }
        if (!this.apiKey) {
            throw new common_1.ServiceUnavailableException('Payment inquiry is not configured (PAYMENTS_API_KEY missing)');
        }
        const statusUrl = `${this.apiBase}/api/v1/get-payment-status/${encodeURIComponent(trackId)}`;
        const upaymentsFetchTimeoutMs = Number(process.env.PAYMENTS_UPAYMENTS_TIMEOUT_MS?.trim() || '60000');
        let res;
        try {
            res = await fetch(statusUrl, {
                method: 'GET',
                signal: AbortSignal.timeout(Number.isFinite(upaymentsFetchTimeoutMs) && upaymentsFetchTimeoutMs > 0
                    ? upaymentsFetchTimeoutMs
                    : 60_000),
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${this.apiKey}`,
                },
            });
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.error(`UPayments get-payment-status fetch failed: ${msg}`);
            return { ok: false, data: {}, raw: { fetchError: msg } };
        }
        const text = await res.text();
        let json;
        try {
            json = text ? JSON.parse(text) : {};
        }
        catch {
            this.logger.error(`UPayments inquiry returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
            return { ok: false, data: {}, raw: text };
        }
        if (!res.ok || json.status === false || !json.data) {
            this.logger.warn(`UPayments inquiry failed for ${trackId}: ${json.message ?? text.slice(0, 200)}`);
            return { ok: false, data: json.data ?? {}, raw: json };
        }
        return { ok: true, data: json.data, raw: json };
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
            s === 'captured' ||
            s === 'authorized') {
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
                posGatewayTrackId: true,
                customer: {
                    select: { id: true, phone: true, phone2: true, displayName: true },
                },
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
            return {
                url: order.posHostedPaymentUrl,
                trackId: order.posGatewayTrackId ?? undefined,
            };
        }
        const phone = order.customer.phone?.trim() || order.customer.phone2?.trim() || '';
        const link = await this.createPaymentLink({
            orderId: order.id,
            amount: order.totalPrice,
            customerPhone: phone,
            customerName: order.customer.displayName ?? undefined,
            customerUniqueId: order.customer.id.slice(0, 20),
        });
        await this.prisma.order.update({
            where: { id: order.id },
            data: {
                posHostedPaymentUrl: link.url,
                posGatewayTrackId: link.trackId ?? null,
                posGatewayMetadata: {
                    charge: {
                        provider: 'upayments',
                        trackId: link.trackId ?? null,
                        link: link.url,
                        createdAt: new Date().toISOString(),
                    },
                },
            },
        });
        return link;
    }
    async findOrderByTrackId(trackId) {
        const row = await this.prisma.order.findFirst({
            where: { posGatewayTrackId: trackId },
            select: { id: true },
        });
        return row?.id ?? null;
    }
    async finalizePaidOrderFromGateway(referenceId, gatewayMetadata) {
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
                await this.finalizeSinglePaidOrderFromGateway(o.id, gatewayMetadata);
            }
            return;
        }
        await this.finalizeSinglePaidOrderFromGateway(referenceId, gatewayMetadata);
    }
    async finalizeSinglePaidOrderFromGateway(orderId, gatewayMetadata) {
        const didFinalize = await this.prisma.$transaction(async (tx) => {
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
                    posGatewayMetadata: true,
                },
            });
            if (!order) {
                throw new common_1.BadRequestException('Order not found');
            }
            if (order.walletSettledAt) {
                return false;
            }
            if (order.status === client_1.OrderStatus.CANCELED) {
                throw new common_1.BadRequestException('Order is canceled — cannot finalize a link payment for it');
            }
            const originalMethod = order.posPaymentMethod;
            const completedAt = new Date();
            const mergedGatewayMetadata = mergeGatewayMetadata(order.posGatewayMetadata, gatewayMetadata, completedAt);
            await tx.order.update({
                where: { id: orderId },
                data: {
                    status: client_1.OrderStatus.COMPLETED,
                    cashStatus: (0, cash_status_for_method_1.cashStatusForPaymentMethod)(client_1.PosPaymentMethod.ONLINE),
                    completedAt,
                    posPaymentMethod: client_1.PosPaymentMethod.ONLINE,
                    walletSettledAt: null,
                    ...(mergedGatewayMetadata
                        ? { posGatewayMetadata: mergedGatewayMetadata }
                        : {}),
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
            return true;
        }, { maxWait: 10_000, timeout: 15_000 });
        if (didFinalize) {
            this.emitPaymentConfirmedNotify(orderId);
        }
    }
    schedulePaymentConfirmedCustomerNotify(orderId) {
        this.emitPaymentConfirmedNotify(orderId);
    }
    emitPaymentConfirmedNotify(orderId) {
        setImmediate(() => {
            void (async () => {
                const row = await this.prisma.order.findUnique({
                    where: { id: orderId },
                    select: {
                        id: true,
                        serialNumber: true,
                        invoiceNumber: true,
                        totalPrice: true,
                        posHostedPaymentUrl: true,
                        customer: { select: { phone: true, phone2: true } },
                    },
                });
                if (!row) {
                    return;
                }
                const phone = (0, kuwait_customer_phone_1.resolveCustomerPhoneForNotify)(row.customer.phone, row.customer.phone2);
                if (!phone.trim()) {
                    this.logger.log(`Payment confirmed notify skipped: no customer phone on file for order ${row.id.slice(0, 8)}…`);
                    return;
                }
                const orderLabel = row.serialNumber?.trim() ||
                    row.invoiceNumber?.trim() ||
                    `#${row.id.slice(0, 8)}`;
                const base = (process.env.PUBLIC_WEB_APP_URL ?? '')
                    .replace(/\/$/, '')
                    .trim();
                const ratingUrl = base ? `${base}/r/${encodeURIComponent(row.id)}` : undefined;
                const paymentUrl = row.posHostedPaymentUrl?.trim() || undefined;
                this.customerNotifications.notifyPaymentConfirmed({
                    customerPhone: phone,
                    orderId: row.id,
                    amountKd: row.totalPrice.toFixed(3),
                    orderLabel,
                    paymentUrl,
                    ratingUrl,
                });
            })().catch((e) => {
                this.logger.warn(`emitPaymentConfirmedNotify: ${e}`);
            });
        });
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
        const result = await this.prisma.$transaction(async (tx) => {
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
                    cashStatus: (0, cash_status_for_method_1.cashStatusForPaymentMethod)(method),
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
        if (!result.alreadySettled) {
            this.emitPaymentConfirmedNotify(orderId);
        }
        return result;
    }
};
exports.PaymentsService = PaymentsService;
exports.PaymentsService = PaymentsService = PaymentsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        customer_ledger_service_1.CustomerLedgerService,
        general_ledger_service_1.GeneralLedgerService,
        inventory_service_1.InventoryService,
        customer_notifications_service_1.CustomerNotificationsService])
], PaymentsService);
function normalizeKwPhone(phone) {
    const d = phone.replace(/[\s-]/g, '').trim();
    if (!d) {
        return '';
    }
    if (d.startsWith('+')) {
        return d;
    }
    if (d.startsWith('965')) {
        return `+${d}`;
    }
    if (d.length === 8) {
        return `+965${d}`;
    }
    return `+${d}`;
}
function mergeGatewayMetadata(existing, incoming, at) {
    if (incoming === undefined || incoming === null) {
        return null;
    }
    const base = existing && typeof existing === 'object' && !Array.isArray(existing)
        ? existing
        : {};
    return {
        ...base,
        callback: {
            receivedAt: at.toISOString(),
            payload: incoming,
        },
    };
}
//# sourceMappingURL=payments.service.js.map