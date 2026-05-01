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
exports.PaymentsService = exports.UPAYMENTS_MAX_DIGIT_ONLY_INQUIRY_LEN = void 0;
exports.isValidUpaymentsPaymentStatusInquiryId = isValidUpaymentsPaymentStatusInquiryId;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const customer_ledger_service_1 = require("../../customer-ledger/customer-ledger.service");
const customer_notifications_service_1 = require("../../customer-notifications/customer-notifications.service");
const general_ledger_service_1 = require("../../general-ledger/general-ledger.service");
const inventory_service_1 = require("../../inventory/inventory.service");
const prisma_service_1 = require("../../prisma/prisma.service");
const app_version_1 = require("../constants/app-version");
const kuwait_customer_phone_1 = require("../validation/kuwait-customer-phone");
const cash_status_for_method_1 = require("../utils/cash-status-for-method");
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
async function sendDiscordAlert(type, data) {
    if (!DISCORD_WEBHOOK_URL)
        return;
    const message = type === 'inconsistency'
        ? `🚨 PAYMENT INCONSISTENCY\n\nOrderId: ${data.orderId ?? null}\nIssues: ${(data.issues ?? []).join(', ')}\nTime: ${new Date().toISOString()}`
        : type === 'error'
            ? `🚨 PAYMENT ERROR\n\nEvent: ${data.event ?? null}\nTransId: ${data.transId ?? null}\nOrderId: ${data.orderId ?? null}\nTime: ${new Date().toISOString()}`
            : `✅ PAYMENT SUCCESS\n\nTransId: ${data.transId ?? null}\nOrderId: ${data.orderId ?? null}\nTime: ${new Date().toISOString()}`;
    try {
        await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                content: message,
            }),
        });
    }
    catch (err) {
        console.error('discord_alert_failed', err);
    }
}
function looksLikeOurOrderUuid(s) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.trim());
}
function coerceStringishTrackValue(v) {
    if (typeof v === 'string') {
        const t = v.trim();
        return t || undefined;
    }
    if (typeof v === 'number' && Number.isFinite(v)) {
        if (!Number.isInteger(v)) {
            return undefined;
        }
        if (!Number.isSafeInteger(v)) {
            return undefined;
        }
        const s = String(v);
        if (s === 'NaN' || s.includes('e') || s.includes('E')) {
            return undefined;
        }
        return s;
    }
    if (typeof v === 'bigint') {
        return v.toString();
    }
    return undefined;
}
const UPAYMENTS_TRACK_LIKE_KEYS = [
    'trans_id',
    'transId',
    'tran_id',
    'tranId',
    'trackId',
    'TrackID',
    'track_id',
    'TrackId',
    'trackID',
    'paymentTrackId',
    'PaymentTrackId',
    'payment_id',
    'paymentId',
    'PaymentId',
    'Payment_ID',
    'invoice_id',
    'invoiceId',
    'InvoiceId',
    'transaction_id',
    'transactionId',
    'TransactionId',
    'receipt_id',
    'receiptId',
    'receiptid',
    'upayment_id',
    'uPaymentId',
    'session_id',
    'sessionId',
    'SessionId',
];
exports.UPAYMENTS_MAX_DIGIT_ONLY_INQUIRY_LEN = 32;
function isPlausibleTrackValue(s, key) {
    if (s.length < 5 || s.length > 128) {
        return false;
    }
    if (s.startsWith('http') || s.startsWith('//')) {
        return false;
    }
    if (/^\d+$/.test(s) && s.length > exports.UPAYMENTS_MAX_DIGIT_ONLY_INQUIRY_LEN) {
        return false;
    }
    if (looksLikeOurOrderUuid(s) && (key === 'id' || key === 'orderId')) {
        return false;
    }
    if (key === 'id' && looksLikeOurOrderUuid(s)) {
        return false;
    }
    return true;
}
function isValidUpaymentsPaymentStatusInquiryId(s) {
    const t = (s ?? '').trim();
    return isPlausibleTrackValue(t, 'inquiry');
}
function isSafeUpaymentsChargeInquiryCandidate(s) {
    const t = (s ?? '').trim();
    if (!isValidUpaymentsPaymentStatusInquiryId(t)) {
        return false;
    }
    if (looksLikeOurOrderUuid(t)) {
        return false;
    }
    return true;
}
function tryParseTrackIdFromRecord(o) {
    if (!o || typeof o !== 'object') {
        return undefined;
    }
    const r = o;
    for (const k of UPAYMENTS_TRACK_LIKE_KEYS) {
        if (!(k in r)) {
            continue;
        }
        const s = coerceStringishTrackValue(r[k]);
        if (s && isPlausibleTrackValue(s, k)) {
            return s;
        }
    }
    return undefined;
}
const TRACK_KEY_NAME_HINT = /track|payment_?id|invoice_?|session_?|tran_?|receipt_?/i;
function deepFindUpaymentsTrackIdWithPredicate(node, depth, accept) {
    if (depth > 12 || node == null) {
        return undefined;
    }
    if (Array.isArray(node)) {
        for (const el of node) {
            const t = deepFindUpaymentsTrackIdWithPredicate(el, depth + 1, accept);
            if (t) {
                return t;
            }
        }
        return undefined;
    }
    if (typeof node !== 'object') {
        return undefined;
    }
    const o = node;
    for (const k of UPAYMENTS_TRACK_LIKE_KEYS) {
        if (!(k in o)) {
            continue;
        }
        const s = coerceStringishTrackValue(o[k]);
        if (s && accept(s, k)) {
            return s;
        }
    }
    if (depth > 0) {
        for (const k of ['id', 'Id', 'ID']) {
            if (!(k in o)) {
                continue;
            }
            const s = coerceStringishTrackValue(o[k]);
            if (s && accept(s, 'id')) {
                return s;
            }
        }
    }
    for (const [k, v] of Object.entries(o)) {
        if (TRACK_KEY_NAME_HINT.test(k)) {
            const s = coerceStringishTrackValue(v);
            if (s && accept(s, k)) {
                return s;
            }
        }
    }
    for (const v of Object.values(o)) {
        if (v != null && typeof v === 'object') {
            const t = deepFindUpaymentsTrackIdWithPredicate(v, depth + 1, accept);
            if (t) {
                return t;
            }
        }
    }
    return undefined;
}
function deepFindUpaymentsTrackId(node, depth) {
    return deepFindUpaymentsTrackIdWithPredicate(node, depth, (s, k) => isPlausibleTrackValue(s, k));
}
function deepFindValidUpaymentsChargeInquiryId(node, depth) {
    return deepFindUpaymentsTrackIdWithPredicate(node, depth, (s) => isSafeUpaymentsChargeInquiryCandidate(s));
}
const TRACK_URL_QUERY_KEYS = [
    'trans_id',
    'transId',
    'tran_id',
    'tranId',
    'track_id',
    'trackId',
    'TrackID',
    'trackid',
    'TrackId',
    'payment_id',
    'paymentId',
    'PaymentId',
    'invoice_id',
    'invoiceId',
    'session_id',
    'sessionId',
    'SessionId',
];
const TRACK_URL_QUERY_KEYS_LOWER = new Set(TRACK_URL_QUERY_KEYS.map((k) => k.toLowerCase()));
function pickTrackIdFromUrlSearchParams(sp) {
    for (const [k, v] of sp.entries()) {
        if (TRACK_URL_QUERY_KEYS_LOWER.has(k.toLowerCase()) && v?.trim()) {
            return v.trim();
        }
    }
    return undefined;
}
function tryParseTrackIdFromPaymentUrl(link) {
    if (!link || typeof link !== 'string') {
        return undefined;
    }
    let normalized = link.trim();
    if (normalized.startsWith('//')) {
        normalized = `https:${normalized}`;
    }
    try {
        const u = new URL(normalized);
        const fromMain = pickTrackIdFromUrlSearchParams(u.searchParams);
        if (fromMain) {
            return fromMain;
        }
        const h = u.hash;
        if (h && h.length > 1) {
            const inner = h.startsWith('#') ? h.slice(1) : h;
            const qMark = inner.indexOf('?');
            if (qMark >= 0) {
                const qp = new URLSearchParams(inner.slice(qMark + 1));
                const fromHash = pickTrackIdFromUrlSearchParams(qp);
                if (fromHash) {
                    return fromHash;
                }
            }
            const loose = new RegExp(`(?:^|[?&#/])(?:${TRACK_URL_QUERY_KEYS.join('|')})=([^&#]+)`, 'i').exec(inner);
            if (loose?.[1]) {
                try {
                    return decodeURIComponent(loose[1].trim());
                }
                catch {
                    return loose[1].trim();
                }
            }
        }
    }
    catch {
    }
    const m = new RegExp(`[?&#/](?:${TRACK_URL_QUERY_KEYS.join('|')})=([^&]+)`, 'i').exec(normalized);
    if (m?.[1]) {
        try {
            return decodeURIComponent(m[1].trim());
        }
        catch {
            return m[1].trim();
        }
    }
    return undefined;
}
function extractUpaymentsChargeTrackId(data, paymentUrl) {
    let t = tryParseTrackIdFromPaymentUrl(paymentUrl);
    if (t && isSafeUpaymentsChargeInquiryCandidate(t)) {
        return t;
    }
    t = tryParseTrackIdFromRecord(data);
    if (t && isSafeUpaymentsChargeInquiryCandidate(t)) {
        return t;
    }
    if (data && typeof data === 'object' && 'data' in data) {
        t = tryParseTrackIdFromRecord(data.data);
        if (t && isSafeUpaymentsChargeInquiryCandidate(t)) {
            return t;
        }
    }
    t = deepFindValidUpaymentsChargeInquiryId(data, 0);
    return t;
}
function extractTrackIdFromChargeLinkEmbeddedInRaw(raw) {
    const m = /"link"\s*:\s*"((?:[^"\\]|\\.)*)"/i.exec(raw) ??
        /"paymentUrl"\s*:\s*"((?:[^"\\]|\\.)*)"/i.exec(raw) ??
        /"paymentLink"\s*:\s*"((?:[^"\\]|\\.)*)"/i.exec(raw) ??
        /"url"\s*:\s*"((?:[^"\\]|\\.)*)"/i.exec(raw);
    if (!m?.[1]) {
        return undefined;
    }
    let linkStr;
    try {
        linkStr = JSON.parse(`"${m[1]}"`);
    }
    catch {
        linkStr = m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    const fromQuery = tryParseTrackIdFromPaymentUrl(linkStr);
    if (fromQuery && isSafeUpaymentsChargeInquiryCandidate(fromQuery)) {
        return fromQuery;
    }
    const pathDigits = /\/(\d{10,28})(?:\?|#|$)/.exec(linkStr);
    if (pathDigits?.[1] && isSafeUpaymentsChargeInquiryCandidate(pathDigits[1])) {
        return pathDigits[1];
    }
    const pathV2 = /\/([0-9a-f]{8,40}v2)(?:\?|#|$)/i.exec(linkStr);
    if (pathV2?.[1] && isSafeUpaymentsChargeInquiryCandidate(pathV2[1])) {
        return pathV2[1];
    }
    return undefined;
}
function extractTrackIdFromChargeRawJsonText(raw) {
    const quotedPatterns = [
        /"trans_?id"\s*:\s*"([^"]{5,128})"/i,
        /"tran_?id"\s*:\s*"([^"]{5,128})"/i,
        /"track_?id"\s*:\s*"([^"]{5,128})"/i,
        /"trackId"\s*:\s*"([^"]{5,128})"/,
        /"TrackID"\s*:\s*"([^"]{5,128})"/,
        /"session_?id"\s*:\s*"([^"]{5,128})"/i,
        /"payment_?id"\s*:\s*"([^"]{5,128})"/i,
        /"PaymentId"\s*:\s*"([^"]{5,128})"/,
        /"invoice_?id"\s*:\s*"([^"]{5,128})"/i,
    ];
    for (const re of quotedPatterns) {
        const m = re.exec(raw);
        const s = m?.[1]?.trim();
        if (s &&
            !s.startsWith('http') &&
            !looksLikeOurOrderUuid(s) &&
            isPlausibleTrackValue(s, 'raw') &&
            isSafeUpaymentsChargeInquiryCandidate(s)) {
            return s;
        }
    }
    const numM = /"(?:trans_?id|tran_?id|track_?id|session_?id|payment_?id|invoice_?id)"\s*:\s*(\d{10,28})\b/.exec(raw);
    if (numM?.[1] && isSafeUpaymentsChargeInquiryCandidate(numM[1])) {
        return numM[1];
    }
    return undefined;
}
function pickHttpUrlFromUnknown(v) {
    if (typeof v !== 'string') {
        return undefined;
    }
    const t = v.trim();
    if (t.startsWith('http://') || t.startsWith('https://')) {
        return t;
    }
    if (t.startsWith('//')) {
        return `https:${t}`;
    }
    return undefined;
}
function resolveUpaymentsChargePaymentUrl(data) {
    const direct = pickHttpUrlFromUnknown(data);
    if (direct) {
        return direct;
    }
    if (Array.isArray(data)) {
        for (const el of data) {
            const u = resolveUpaymentsChargePaymentUrl(el);
            if (u) {
                return u;
            }
        }
        return undefined;
    }
    if (!data || typeof data !== 'object') {
        return undefined;
    }
    const d = data;
    const linkKeys = new Set([
        'link',
        'url',
        'paymenturl',
        'paymentlink',
        'href',
        'redirecturl',
        'redirect_url',
    ]);
    for (const [k, v] of Object.entries(d)) {
        if (!linkKeys.has(k.replace(/\s/g, '').toLowerCase())) {
            continue;
        }
        const t = pickHttpUrlFromUnknown(v);
        if (t) {
            return t;
        }
    }
    return undefined;
}
function resolveUpaymentsChargePaymentUrlFromRoot(json) {
    const fromData = resolveUpaymentsChargePaymentUrl(json.data);
    if (fromData) {
        return fromData;
    }
    const res = json.result;
    if (res && typeof res === 'object' && !Array.isArray(res)) {
        const r = res;
        const nested = resolveUpaymentsChargePaymentUrl(r.data) ??
            resolveUpaymentsChargePaymentUrl(r);
        if (nested) {
            return nested;
        }
    }
    return resolveUpaymentsChargePaymentUrl(json);
}
function extractTrackIdFromHttpsUrlsInChargeRaw(raw) {
    const re = /https?:\/\/[^\s"']{8,2048}/gi;
    let m;
    let n = 0;
    while ((m = re.exec(raw)) !== null && n++ < 48) {
        const candidate = m[0].replace(/[,;.)}\]]+$/g, '');
        if (!/(upayment|upayments|checkout|payment|pay\.|kpay|knet|u\.kw|safari)/i.test(candidate)) {
            continue;
        }
        const tid = tryParseTrackIdFromPaymentUrl(candidate);
        if (tid && isSafeUpaymentsChargeInquiryCandidate(tid)) {
            return tid;
        }
    }
    return undefined;
}
let PaymentsService = class PaymentsService {
    static { PaymentsService_1 = this; }
    prisma;
    customerLedger;
    generalLedger;
    inventory;
    customerNotifications;
    logger = new common_1.Logger(PaymentsService_1.name);
    activePollingTransIds = new Set();
    totalPaymentsProcessed = 0;
    totalFailures = 0;
    totalDuplicates = 0;
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
    looksLikeLocalHost(url) {
        return /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(url);
    }
    onModuleInit() {
        const inProd = process.env.NODE_ENV === 'production';
        if (inProd && !this.isPublicMockCheckoutAvailable()) {
            if (this.looksLikeLocalHost(this.webAppUrl)) {
                this.logger.error('PAYMENTS: PUBLIC_WEB_APP_URL is localhost (or loopback) while real UPayments is enabled. After pay, the gateway redirects the customer to this URL — phones cannot open it. Set PUBLIC_WEB_APP_URL to your public SPA (e.g. https://www.safariomni.com) and redeploy.');
            }
            if (!this.callbackPublicUrl) {
                const fallback = (process.env.PUBLIC_API_URL ?? '').replace(/\/$/, '');
                if (!fallback || this.looksLikeLocalHost(fallback)) {
                    this.logger.error('PAYMENTS: PAYMENTS_CALLBACK_PUBLIC_URL is unset and PUBLIC_API_URL is missing or not internet-reachable. UPayments cannot POST /api/payments/callback; orders may stay unpaid. Set PAYMENTS_CALLBACK_PUBLIC_URL to the public https base of this API (same as deploy/render-production.env).');
                }
            }
            else if (this.looksLikeLocalHost(this.callbackPublicUrl)) {
                this.logger.error('PAYMENTS: PAYMENTS_CALLBACK_PUBLIC_URL must be a public https host — not localhost. UPayments server-to-server callback will never reach your app.');
            }
        }
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
        const returnUrl = `${this.webAppUrl}/payment/success`;
        const cancelUrl = `${this.webAppUrl}/payment/failed`;
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
        const dataBlock = json.data;
        const url = resolveUpaymentsChargePaymentUrlFromRoot(json);
        if (!url) {
            throw new common_1.BadRequestException('UPayments response missing payment link (`data.link` / `data.url` / similar)');
        }
        let trackId = extractUpaymentsChargeTrackId(dataBlock, url);
        if (!trackId) {
            trackId = deepFindValidUpaymentsChargeInquiryId(json, 0);
        }
        if (!trackId) {
            const tr = tryParseTrackIdFromRecord(json);
            if (tr && isSafeUpaymentsChargeInquiryCandidate(tr)) {
                trackId = tr;
            }
        }
        if (!trackId) {
            trackId = extractTrackIdFromChargeRawJsonText(text);
        }
        if (!trackId) {
            trackId = extractTrackIdFromChargeLinkEmbeddedInRaw(text);
        }
        if (!trackId) {
            trackId = extractTrackIdFromHttpsUrlsInChargeRaw(text);
        }
        const validatedTrackId = trackId
            ? this.tryValidateChargePaymentStatusId(trackId, text, params.orderId)
            : undefined;
        if (!validatedTrackId) {
            const dataKeys = dataBlock && typeof dataBlock === 'object' && !Array.isArray(dataBlock)
                ? Object.keys(dataBlock).join(',')
                : typeof dataBlock === 'string'
                    ? '(string)'
                    : Array.isArray(dataBlock)
                        ? '(array)'
                        : 'n/a';
            this.logger.warn(`UPayments /charge: no inquiry id in response (order=${params.orderId}). data keys=[${dataKeys}]. Link returned; webhook will provide trans_id/track_id. Raw=${text.slice(0, 800)}`);
        }
        if (validatedTrackId) {
            this.startGatewayStatusPolling(params.orderId, validatedTrackId);
        }
        return {
            url,
            reference: validatedTrackId,
            trackId: validatedTrackId,
        };
    }
    tryValidateChargePaymentStatusId(primary, rawJsonText, orderIdForLog) {
        const t = primary.trim();
        if (isValidUpaymentsPaymentStatusInquiryId(t)) {
            return t;
        }
        this.logger.warn(`UPayments /charge: resolved inquiry id rejected (len=${t.length}) order=${orderIdForLog.slice(0, 8)}… — attempting recovery from raw JSON`);
        const recovered = extractTrackIdFromChargeRawJsonText(rawJsonText);
        if (recovered && isSafeUpaymentsChargeInquiryCandidate(recovered)) {
            return recovered;
        }
        const fromLink = extractTrackIdFromChargeLinkEmbeddedInRaw(rawJsonText);
        if (fromLink && isSafeUpaymentsChargeInquiryCandidate(fromLink)) {
            return fromLink;
        }
        const fromAnyUrl = extractTrackIdFromHttpsUrlsInChargeRaw(rawJsonText);
        if (fromAnyUrl && isSafeUpaymentsChargeInquiryCandidate(fromAnyUrl)) {
            return fromAnyUrl;
        }
        this.logger.warn(`UPayments /charge: inquiry id unrecoverable order=${orderIdForLog} badLen=${t.length} — will rely on webhook trans_id`);
        return undefined;
    }
    async fetchGatewayStatus(trackId) {
        const clean = trackId.trim();
        if (!clean) {
            return { ok: false, data: {}, raw: null };
        }
        if (!isValidUpaymentsPaymentStatusInquiryId(clean)) {
            this.logger.warn(`UPayments inquiry skipped: invalid inquiry id (len=${clean.length}) prefix=${clean.slice(0, 20)}…`);
            return {
                ok: false,
                data: {},
                raw: { invalidInquiryId: clean.slice(0, 80) },
            };
        }
        if (this.usePlaceholderGateway()) {
            return { ok: false, data: {}, raw: null };
        }
        if (!this.apiKey) {
            throw new common_1.ServiceUnavailableException('Payment inquiry is not configured (PAYMENTS_API_KEY missing)');
        }
        const statusUrl = `${this.apiBase}/api/v1/get-payment-status/${encodeURIComponent(clean)}`;
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
            this.logger.warn(`UPayments inquiry failed for ${clean}: ${json.message ?? text.slice(0, 200)}`);
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
        const raw = (status ?? '').trim();
        if (!raw) {
            return 'failed';
        }
        const s = raw.toLowerCase();
        const firstSegment = (s.split(/[,;|]/)[0] ?? s).trim();
        const head = (firstSegment.split(/\s+/)[0] ?? firstSegment).trim();
        if (head === 'success' ||
            head === 'paid' ||
            head === 'completed' ||
            head === 'captured' ||
            head === 'authorized' ||
            head === 'capture') {
            return 'success';
        }
        if (/\bcaptured\b/.test(s) && !/\b(not|un|de|pre)\s*captured\b/.test(s)) {
            return 'success';
        }
        return 'failed';
    }
    async tryFinalizeOrderIfUpaymentsCaptured(orderId, inquiryTrackId, source) {
        const clean = inquiryTrackId.trim();
        if (!clean) {
            return { finalized: false, gatewayResult: null, inquiryRaw: null };
        }
        return this.checkPaymentStatus(clean, orderId, source);
    }
    async tryFinalizeOrderFromTrustedUpaymentsReturn(orderId, trackId, _gatewayResultRaw, source, _extras) {
        const clean = trackId.trim();
        if (!clean) {
            return { finalized: false };
        }
        const r = await this.checkPaymentStatus(clean, orderId, source);
        return { finalized: r.finalized };
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
        if (order.posHostedPaymentUrl && order.posGatewayTrackId) {
            return {
                url: order.posHostedPaymentUrl,
                trackId: order.posGatewayTrackId,
            };
        }
        if (order.posHostedPaymentUrl && !order.posGatewayTrackId) {
            this.logger.warn(`Payment link missing trackId (repair): orderId=${order.id} — creating new UPayments session`);
        }
        const phone = order.customer.phone?.trim() || order.customer.phone2?.trim() || '';
        const link = await this.createPaymentLink({
            orderId: order.id,
            amount: order.totalPrice,
            customerPhone: phone,
            customerName: order.customer.displayName ?? undefined,
            customerUniqueId: order.customer.id.slice(0, 20),
        });
        const tid = link.trackId ?? null;
        await this.prisma.order.update({
            where: { id: order.id },
            data: {
                posHostedPaymentUrl: link.url,
                posGatewayTrackId: tid,
                posGatewayMetadata: {
                    charge: {
                        provider: 'upayments',
                        trackId: tid,
                        link: link.url,
                        createdAt: new Date().toISOString(),
                    },
                },
            },
        });
        const persisted = await this.prisma.order.findUnique({
            where: { id: order.id },
            select: { posGatewayTrackId: true },
        });
        if (!persisted?.posGatewayTrackId) {
            this.logger.error(`posGatewayTrackId not readable after update orderId=${order.id}`);
            throw new common_1.InternalServerErrorException('Failed to persist gateway track id. Check database and Order.posGatewayTrackId column.');
        }
        return link;
    }
    async findOrderByTrackId(trackId) {
        const row = await this.prisma.order.findFirst({
            where: { posGatewayTrackId: trackId },
            select: { id: true },
        });
        return row?.id ?? null;
    }
    paymentLog(event, data) {
        const alertEvent = data.status === 'gateway_error' ? 'gateway_error' : event;
        if (alertEvent === 'gateway_error' || alertEvent === 'finalize_rejected') {
            void sendDiscordAlert('error', {
                event: alertEvent,
                transId: data.transId ?? null,
                orderId: data.orderId ?? null,
            });
        }
        if (event === 'finalize_success') {
            void sendDiscordAlert('success', {
                transId: data.transId ?? null,
                orderId: data.orderId ?? null,
            });
        }
        this.logger.log(JSON.stringify({
            event,
            transId: data.transId ?? null,
            orderId: data.orderId ?? null,
            status: data.status ?? 'info',
            timestamp: new Date().toISOString(),
            totalPaymentsProcessed: this.totalPaymentsProcessed,
            totalFailures: this.totalFailures,
            totalDuplicates: this.totalDuplicates,
            ...data,
        }));
    }
    paymentError(event, data) {
        const alertEvent = data.status === 'gateway_error' ? 'gateway_error' : event;
        if (alertEvent === 'gateway_error' ||
            alertEvent === 'finalize_rejected' ||
            alertEvent === 'polling_failed') {
            void sendDiscordAlert('error', {
                event: alertEvent,
                transId: data.transId ?? null,
                orderId: data.orderId ?? null,
            });
        }
        console.error(JSON.stringify({
            event,
            transId: data.transId ?? null,
            orderId: data.orderId ?? null,
            status: data.status ?? 'error',
            timestamp: new Date().toISOString(),
            totalPaymentsProcessed: this.totalPaymentsProcessed,
            totalFailures: this.totalFailures,
            totalDuplicates: this.totalDuplicates,
            ...data,
        }));
    }
    async runPostPaymentSelfCheck(orderId) {
        try {
            const order = await this.prisma.order.findUnique({
                where: { id: orderId },
                include: {
                    transactionHistory: true,
                },
            });
            if (!order)
                return;
            const issues = [];
            if (order.status !== client_1.OrderStatus.COMPLETED) {
                issues.push('order_not_completed');
            }
            if (!order.walletSettledAt) {
                issues.push('wallet_not_settled');
            }
            if (!order.transactionHistory || order.transactionHistory.length === 0) {
                issues.push('missing_transaction_history');
            }
            if (issues.length > 0) {
                await sendDiscordAlert('inconsistency', {
                    orderId,
                    issues,
                });
            }
        }
        catch (err) {
            console.error('post_payment_self_check_failed', err);
        }
    }
    async checkPaymentStatus(transId, expectedOrderId, source = 'POLLING') {
        const clean = transId.trim();
        if (!clean || !isValidUpaymentsPaymentStatusInquiryId(clean)) {
            this.totalFailures += 1;
            this.paymentError('finalize_rejected', {
                transId: clean || null,
                orderId: expectedOrderId ?? null,
                status: 'invalid_trans_id',
            });
            this.logger.warn(`finalize_rejected invalid_trans_id prefix=${clean.slice(0, 16)}`);
            return { finalized: false, gatewayResult: null, inquiryRaw: null };
        }
        if (expectedOrderId && (await this.isGatewayReferencePaid(expectedOrderId))) {
            this.totalDuplicates += 1;
            this.paymentLog('duplicate_noop', {
                transId: clean,
                orderId: expectedOrderId,
                status: 'already_paid',
            });
            this.logger.log(`ignored_duplicate_capture orderId=${expectedOrderId}`);
            return { finalized: true, gatewayResult: null, inquiryRaw: null };
        }
        const inquiry = await this.fetchGatewayStatus(clean);
        const gatewayResult = inquiry.data.result?.toString() ?? null;
        if (!inquiry.ok) {
            this.totalFailures += 1;
            this.paymentError('finalize_rejected', {
                transId: clean,
                orderId: expectedOrderId ?? null,
                status: 'gateway_error',
                gatewayResult,
            });
            return { finalized: false, gatewayResult, inquiryRaw: inquiry.raw };
        }
        if (this.normalizeCallbackStatus(inquiry.data.result ?? '') !== 'success') {
            return { finalized: false, gatewayResult, inquiryRaw: inquiry.raw };
        }
        const inquiryOrderId = inquiry.data.order?.id?.trim() ||
            extractOrderIdFromUpaymentsExtraData(inquiry.data.customerExtraData);
        const linkedOrderId = await this.findOrderByTrackId(clean);
        const referenceId = inquiryOrderId || expectedOrderId || linkedOrderId || null;
        if (!referenceId) {
            this.totalFailures += 1;
            this.paymentLog('finalize_rejected', {
                transId: clean,
                orderId: null,
                status: 'order_not_found',
            });
            this.logger.warn(`finalize_rejected order_not_found transId=${clean.slice(0, 16)}`);
            return { finalized: false, gatewayResult, inquiryRaw: inquiry.raw };
        }
        if (expectedOrderId && referenceId !== expectedOrderId) {
            this.totalFailures += 1;
            this.paymentLog('finalize_rejected', {
                transId: clean,
                orderId: expectedOrderId,
                status: 'order_mismatch',
                actualOrderId: referenceId,
            });
            this.logger.warn(`finalize_rejected order_mismatch expected=${expectedOrderId} actual=${referenceId} transId=${clean.slice(0, 16)}`);
            return { finalized: false, gatewayResult, inquiryRaw: inquiry.raw };
        }
        const reference = await this.getGatewayReferenceForFinalize(referenceId);
        if (!reference) {
            this.totalFailures += 1;
            this.paymentLog('finalize_rejected', {
                transId: clean,
                orderId: referenceId,
                status: 'order_missing',
            });
            this.logger.warn(`finalize_rejected order_missing orderId=${referenceId}`);
            return { finalized: false, gatewayResult, inquiryRaw: inquiry.raw };
        }
        if (reference.isPaid) {
            this.totalDuplicates += 1;
            this.paymentLog('duplicate_noop', {
                transId: clean,
                orderId: reference.id,
                status: 'already_paid',
            });
            this.logger.log(`duplicate_noop orderId=${reference.id}`);
            return { finalized: true, gatewayResult, inquiryRaw: inquiry.raw };
        }
        const stored = reference.trackId?.trim() ?? '';
        if (stored && stored !== clean) {
            this.totalFailures += 1;
            this.paymentLog('finalize_rejected', {
                transId: clean,
                orderId: reference.id,
                status: 'trans_mismatch',
            });
            this.logger.warn(`finalize_rejected trans_mismatch orderId=${reference.id} stored=${stored.slice(0, 16)} incoming=${clean.slice(0, 16)}`);
            return { finalized: false, gatewayResult, inquiryRaw: inquiry.raw };
        }
        const gatewayAmountMinor = parseKwdMinor(inquiry.data.amount);
        const expectedAmountMinor = parseKwdMinor(reference.amount.toString());
        if (gatewayAmountMinor === null || gatewayAmountMinor !== expectedAmountMinor) {
            this.totalFailures += 1;
            this.paymentError('finalize_rejected', {
                transId: clean,
                orderId: reference.id,
                status: 'amount_mismatch',
                expectedAmountMinor,
                gatewayAmountMinor,
            });
            this.logger.warn(`finalize_rejected amount_mismatch orderId=${reference.id} expectedMinor=${expectedAmountMinor} gatewayMinor=${gatewayAmountMinor}`);
            return { finalized: false, gatewayResult, inquiryRaw: inquiry.raw };
        }
        const currency = inquiry.data.currency?.trim().toUpperCase();
        if (currency && currency !== 'KWD') {
            this.totalFailures += 1;
            this.paymentLog('finalize_rejected', {
                transId: clean,
                orderId: reference.id,
                status: 'currency_mismatch',
                currency,
            });
            this.logger.warn(`finalize_rejected currency_mismatch orderId=${reference.id} currency=${currency}`);
            return { finalized: false, gatewayResult, inquiryRaw: inquiry.raw };
        }
        this.logger.log(`about_to_finalize orderId=${reference.id} source=${source} trackId=${clean} version=${app_version_1.APP_VERSION}`);
        const finalized = await this.finalizePaidOrderFromGateway(reference.id, {
            provider: 'upayments',
            trackId: clean,
            source,
            paymentId: inquiry.data.paymentId ?? null,
            tranId: inquiry.data.transactionId ?? null,
            result: inquiry.data.result ?? null,
            amount: String(inquiry.data.amount ?? ''),
            currency: currency ?? null,
            inquiryRaw: inquiry.raw,
        });
        return { finalized, gatewayResult, inquiryRaw: inquiry.raw };
    }
    startGatewayStatusPolling(orderId, transId) {
        const pollingKey = transId.trim();
        if (this.activePollingTransIds.has(pollingKey)) {
            this.totalDuplicates += 1;
            this.paymentLog('duplicate_noop', {
                transId: pollingKey,
                orderId,
                status: 'polling_already_active',
            });
            this.logger.log(`duplicate_noop polling transId=${pollingKey.slice(0, 16)}`);
            return;
        }
        this.activePollingTransIds.add(pollingKey);
        this.paymentLog('polling_started', {
            transId: pollingKey,
            orderId,
            status: 'started',
        });
        this.logger.log(`polling_started orderId=${orderId} transId=${transId.slice(0, 16)}`);
        void (async () => {
            try {
                for (let attempt = 1; attempt <= 3; attempt += 1) {
                    if (attempt > 1) {
                        await delay(20_000);
                    }
                    if (await this.isGatewayReferencePaid(orderId)) {
                        this.totalDuplicates += 1;
                        this.paymentLog('duplicate_noop', {
                            transId: pollingKey,
                            orderId,
                            status: 'already_paid',
                        });
                        this.logger.log(`duplicate_noop polling orderId=${orderId}`);
                        return;
                    }
                    const result = await this.checkPaymentStatus(transId, orderId, `POLLING_ATTEMPT_${attempt}`);
                    if (result.finalized) {
                        this.paymentLog('polling_success', {
                            transId: pollingKey,
                            orderId,
                            status: 'finalized',
                            attempt,
                        });
                        this.logger.log(`polling_success orderId=${orderId} attempt=${attempt}`);
                        return;
                    }
                    if (attempt < 3) {
                        this.paymentLog('polling_retry', {
                            transId: pollingKey,
                            orderId,
                            status: 'retry',
                            attempt,
                            gatewayResult: result.gatewayResult ?? null,
                        });
                        this.logger.log(`polling_retry orderId=${orderId} attempt=${attempt} gatewayResult=${result.gatewayResult ?? 'n/a'}`);
                    }
                }
                this.totalFailures += 1;
                this.paymentError('polling_failed', {
                    transId: pollingKey,
                    orderId,
                    status: 'max_retries_exhausted',
                });
                this.logger.warn(`polling_failed orderId=${orderId} transId=${transId.slice(0, 16)}`);
            }
            finally {
                this.activePollingTransIds.delete(pollingKey);
            }
        })().catch((e) => {
            this.totalFailures += 1;
            this.paymentError('polling_failed', {
                transId: pollingKey,
                orderId,
                status: 'exception',
                error: e instanceof Error ? e.message : String(e),
            });
            this.logger.warn(`polling_failed orderId=${orderId}: ${e}`);
        });
    }
    async isGatewayReferencePaid(referenceId) {
        const order = await this.prisma.order.findUnique({
            where: { id: referenceId },
            select: { status: true, walletSettledAt: true },
        });
        if (order) {
            return order.status === client_1.OrderStatus.COMPLETED || Boolean(order.walletSettledAt);
        }
        const bundle = await this.prisma.posPaymentBundle.findUnique({
            where: { id: referenceId },
            select: {
                orders: {
                    select: { status: true, walletSettledAt: true },
                },
            },
        });
        return Boolean(bundle?.orders.length &&
            bundle.orders.every((o) => o.status === client_1.OrderStatus.COMPLETED || Boolean(o.walletSettledAt)));
    }
    async getGatewayReferenceForFinalize(referenceId) {
        const order = await this.prisma.order.findUnique({
            where: { id: referenceId },
            select: {
                id: true,
                totalPrice: true,
                status: true,
                walletSettledAt: true,
                posGatewayTrackId: true,
            },
        });
        if (order) {
            return {
                id: order.id,
                amount: order.totalPrice,
                trackId: order.posGatewayTrackId,
                isPaid: order.status === client_1.OrderStatus.COMPLETED || Boolean(order.walletSettledAt),
            };
        }
        const bundle = await this.prisma.posPaymentBundle.findUnique({
            where: { id: referenceId },
            select: {
                id: true,
                totalAmountKd: true,
                orders: {
                    select: {
                        status: true,
                        walletSettledAt: true,
                        posGatewayTrackId: true,
                    },
                },
            },
        });
        if (!bundle) {
            return null;
        }
        return {
            id: bundle.id,
            amount: bundle.totalAmountKd,
            trackId: bundle.orders.find((o) => o.posGatewayTrackId)?.posGatewayTrackId ?? null,
            isPaid: bundle.orders.length > 0 &&
                bundle.orders.every((o) => o.status === client_1.OrderStatus.COMPLETED || Boolean(o.walletSettledAt)),
        };
    }
    async finalizePaidOrderFromGateway(referenceId, gatewayMetadata) {
        this.logger.log(`finalize_started orderId=${referenceId} version=${app_version_1.APP_VERSION}`);
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
            let didFinalizeAny = false;
            for (const o of bundle.orders) {
                didFinalizeAny =
                    (await this.finalizeSinglePaidOrderFromGateway(o.id, gatewayMetadata)) ||
                        didFinalizeAny;
            }
            return didFinalizeAny;
        }
        return this.finalizeSinglePaidOrderFromGateway(referenceId, gatewayMetadata);
    }
    async finalizeSinglePaidOrderFromGateway(orderId, gatewayMetadata) {
        this.logger.log(`finalize_started orderId=${orderId} version=${app_version_1.APP_VERSION}`);
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
                    posPaymentBundleId: true,
                    posGatewayTrackId: true,
                    posGatewayMetadata: true,
                },
            });
            if (!order) {
                throw new common_1.BadRequestException('Order not found');
            }
            if (order.walletSettledAt || order.status === client_1.OrderStatus.COMPLETED) {
                this.totalDuplicates += 1;
                this.paymentLog('duplicate_noop', {
                    transId: order.posGatewayTrackId,
                    orderId: order.id,
                    status: 'already_paid',
                });
                this.logger.log(`ignored_duplicate_capture orderId=${order.id}`);
                return false;
            }
            if (order.status === client_1.OrderStatus.CANCELED) {
                throw new common_1.BadRequestException('Order is canceled — cannot finalize a link payment for it');
            }
            const completedAt = new Date();
            const mergedGatewayMetadata = mergeGatewayMetadata(order.posGatewayMetadata, gatewayMetadata, completedAt);
            const inquiryCapableTrackId = extractTrackIdFromFinalizeGatewayMetadata(gatewayMetadata);
            const bundleAmount = order.posPaymentBundleId
                ? await tx.posPaymentBundle.findUnique({
                    where: { id: order.posPaymentBundleId },
                    select: { totalAmountKd: true },
                })
                : null;
            const gatewayChecks = validateFinalizeGatewayMetadata(gatewayMetadata, bundleAmount?.totalAmountKd ?? order.totalPrice, order.posGatewayTrackId, inquiryCapableTrackId);
            if (!gatewayChecks.ok) {
                this.totalFailures += 1;
                this.paymentLog('finalize_rejected', {
                    transId: inquiryCapableTrackId ?? order.posGatewayTrackId,
                    orderId: order.id,
                    status: gatewayChecks.reason,
                });
                this.logger.warn(`finalize_rejected ${gatewayChecks.reason} orderId=${order.id}`);
                return false;
            }
            const claim = await tx.order.updateMany({
                where: {
                    id: orderId,
                    walletSettledAt: null,
                    status: { not: client_1.OrderStatus.COMPLETED },
                },
                data: {
                    status: client_1.OrderStatus.COMPLETED,
                    cashStatus: (0, cash_status_for_method_1.cashStatusForPaymentMethod)(client_1.PosPaymentMethod.ONLINE),
                    completedAt,
                    posPaymentMethod: client_1.PosPaymentMethod.ONLINE,
                    walletSettledAt: null,
                    ccCollectionPaymentWaLocked: false,
                    ...(inquiryCapableTrackId
                        ? { posGatewayTrackId: inquiryCapableTrackId }
                        : {}),
                    ...(mergedGatewayMetadata
                        ? { posGatewayMetadata: mergedGatewayMetadata }
                        : {}),
                },
            });
            this.logger.log(`finalize_claim_result orderId=${order.id} count=${claim.count} version=${app_version_1.APP_VERSION}`);
            if (claim.count === 0) {
                this.totalDuplicates += 1;
                this.paymentLog('duplicate_noop', {
                    transId: inquiryCapableTrackId ?? order.posGatewayTrackId,
                    orderId: order.id,
                    status: 'claim_lost',
                });
                this.logger.log(`ignored_duplicate_capture orderId=${order.id}`);
                return false;
            }
            this.logger.log(`first_successful_capture orderId=${order.id}`);
            this.logger.log(`payment_invoice_updated orderId=${order.id} status=${client_1.OrderStatus.COMPLETED} paymentMethod=${client_1.PosPaymentMethod.ONLINE}`);
            const originalMethod = order.posPaymentMethod;
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
                debtSettledFlag: true,
                debtSettlementViaLink: true,
                trackId: inquiryCapableTrackId ?? order.posGatewayTrackId,
                originalPaymentMethod: originalMethod ?? null,
                reportingCategory: 'DEBT_COLLECTION_VIA_LINK',
            };
            const walletBeforeSettlement = await tx.customerWallet.findUnique({
                where: { customerId: order.customerId },
                select: { debt: true },
            });
            await this.customerLedger.applyOrderWalletSettlementForCompletedOrder(tx, orderId, performerId, prefetch, extraMetadata);
            const walletAfterSettlement = await tx.customerWallet.findUnique({
                where: { customerId: order.customerId },
                select: { debt: true },
            });
            this.logger.log(`payment_wallet_updated orderId=${order.id} customerId=${order.customerId} debtBefore=${walletBeforeSettlement?.debt.toString() ?? '0'} debtAfter=${walletAfterSettlement?.debt.toString() ?? '0'} version=${app_version_1.APP_VERSION}`);
            this.logger.log(`payment_financial_transaction_recorded orderId=${order.id} customerId=${order.customerId} amount=${order.totalPrice.toString()} trackId=${inquiryCapableTrackId ?? order.posGatewayTrackId ?? 'n/a'} version=${app_version_1.APP_VERSION}`);
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
            this.totalPaymentsProcessed += 1;
            this.paymentLog('finalize_success', {
                transId: inquiryCapableTrackId ?? order.posGatewayTrackId,
                orderId: order.id,
                status: 'completed',
            });
            return true;
        }, { maxWait: 10_000, timeout: 15_000 });
        if (didFinalize) {
            await this.runPostPaymentSelfCheck(orderId);
            this.emitPaymentConfirmedNotify(orderId);
        }
        return didFinalize;
    }
    static GATEWAY_ORDER_FRESH_MS = 72 * 3600 * 1000;
    inferPaymentScenarioFromOrderAge(createdAt) {
        return Date.now() - createdAt.getTime() <=
            PaymentsService_1.GATEWAY_ORDER_FRESH_MS
            ? 'new_pos_order'
            : 'debt_receipt';
    }
    schedulePaymentConfirmedCustomerNotify(orderId, scenario) {
        this.emitPaymentConfirmedNotify(orderId, scenario);
    }
    emitPaymentConfirmedNotify(orderId, scenario) {
        setImmediate(() => {
            void (async () => {
                const row = await this.prisma.order.findUnique({
                    where: { id: orderId },
                    select: {
                        id: true,
                        createdAt: true,
                        serialNumber: true,
                        invoiceNumber: true,
                        totalPrice: true,
                        posHostedPaymentUrl: true,
                        posPaymentMethod: true,
                        customer: {
                            select: {
                                phone: true,
                                phone2: true,
                                wallet: { select: { debt: true, balance: true } },
                            },
                        },
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
                const snPersisted = row.serialNumber?.trim();
                const invPersisted = row.invoiceNumber?.trim();
                if (!snPersisted && !invPersisted) {
                    this.logger.warn(`Payment confirmed notify skipped — no persisted serialNumber/invoiceNumber (order ${row.id}); refuse draft-style labels.`);
                    return;
                }
                const orderLabel = snPersisted || invPersisted;
                const customerScenario = scenario ??
                    this.inferPaymentScenarioFromOrderAge(row.createdAt);
                const base = (process.env.PUBLIC_WEB_APP_URL ?? '')
                    .replace(/\/$/, '')
                    .trim();
                const ratingUrl = base ? `${base}/r/${encodeURIComponent(row.id)}` : undefined;
                const paymentUrl = row.posHostedPaymentUrl?.trim() || undefined;
                const walletDebt = row.customer.wallet?.debt ?? new client_1.Prisma.Decimal(0);
                const walletBal = row.customer.wallet?.balance ?? new client_1.Prisma.Decimal(0);
                const method = row.posPaymentMethod;
                let variant = 'standard';
                let walletDebtKd;
                let remainingSubscriptionBalanceKd;
                let totalDebtKd;
                if (method === client_1.PosPaymentMethod.SUBSCRIPTION_WALLET) {
                    variant = 'subscription_wallet';
                    remainingSubscriptionBalanceKd = walletBal.toFixed(3);
                }
                else if (method === client_1.PosPaymentMethod.DEBT_ON_ACCOUNT) {
                    variant = 'debt_on_account';
                    totalDebtKd = walletDebt.toFixed(3);
                }
                else if (walletDebt.gt(0)) {
                    walletDebtKd = walletDebt.toFixed(3);
                }
                this.customerNotifications.notifyPaymentConfirmed({
                    customerPhone: phone,
                    orderId: row.id,
                    amountKd: row.totalPrice.toFixed(3),
                    orderLabel,
                    paymentUrl,
                    ratingUrl,
                    customerScenario,
                    variant,
                    walletDebtKd,
                    remainingSubscriptionBalanceKd,
                    totalDebtKd,
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
            const awaitingDebtPhysicalCollection = Boolean(order.walletSettledAt) &&
                order.posPaymentMethod === client_1.PosPaymentMethod.DEBT_ON_ACCOUNT;
            if (order.walletSettledAt && !awaitingDebtPhysicalCollection) {
                return {
                    orderId: order.id,
                    alreadySettled: true,
                    amountKd: order.totalPrice.toFixed(3),
                    posPaymentMethod: order.posPaymentMethod ?? client_1.PosPaymentMethod.CASH,
                };
            }
            if (awaitingDebtPhysicalCollection) {
                const performerId = performedByUserId ??
                    order.driverId ??
                    (await this.resolveFallbackPerformer(tx));
                if (!performerId) {
                    throw new common_1.BadRequestException('No performer available to attribute the manual settlement to');
                }
                const out = await this.customerLedger.recordDebtInvoiceCollectedAtCallCenter(tx, {
                    orderId,
                    confirmedMethod: method,
                    performedByUserId: performerId,
                });
                return {
                    orderId: order.id,
                    alreadySettled: false,
                    amountKd: order.totalPrice.toFixed(3),
                    posPaymentMethod: method,
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
                    ccCollectionPaymentWaLocked: false,
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
            this.emitPaymentConfirmedNotify(orderId, 'debt_receipt');
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
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function parseKwdMinor(raw) {
    if (raw === undefined || raw === null)
        return null;
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(value))
        return null;
    return Math.round(value * 1000);
}
function validateFinalizeGatewayMetadata(meta, orderTotal, storedTrackId, incomingTrackId) {
    if (meta == null || typeof meta !== 'object' || Array.isArray(meta)) {
        return { ok: true };
    }
    const m = meta;
    if (m.devMock === true || m.provider === 'legacy-hmac') {
        return { ok: true };
    }
    if (m.provider !== 'upayments') {
        return { ok: true };
    }
    const stored = storedTrackId?.trim() ?? '';
    const incoming = incomingTrackId?.trim() ?? '';
    if (!incoming) {
        return { ok: false, reason: 'missing_trans_id' };
    }
    if (stored && stored !== incoming) {
        return { ok: false, reason: 'trans_mismatch' };
    }
    const gatewayAmountMinor = parseKwdMinor(typeof m.amount === 'string' || typeof m.amount === 'number'
        ? m.amount
        : undefined);
    const orderAmountMinor = parseKwdMinor(orderTotal.toString());
    if (gatewayAmountMinor === null || gatewayAmountMinor !== orderAmountMinor) {
        return { ok: false, reason: 'amount_mismatch' };
    }
    const currency = typeof m.currency === 'string' ? m.currency.trim().toUpperCase() : '';
    if (currency && currency !== 'KWD') {
        return { ok: false, reason: 'currency_mismatch' };
    }
    return { ok: true };
}
function extractTrackIdFromFinalizeGatewayMetadata(meta) {
    if (meta == null || typeof meta !== 'object' || Array.isArray(meta)) {
        return undefined;
    }
    const m = meta;
    const candidates = [
        tryParseTrackIdFromRecord(m),
    ];
    const callback = m.callback;
    if (callback && typeof callback === 'object' && !Array.isArray(callback)) {
        const payload = callback.payload;
        candidates.push(tryParseTrackIdFromRecord(payload));
    }
    for (const c of candidates) {
        if (c && isValidUpaymentsPaymentStatusInquiryId(c)) {
            return c.trim();
        }
    }
    const legacy = m.trackId ?? m.TrackID;
    if (typeof legacy === 'string') {
        const s = legacy.trim();
        if (isValidUpaymentsPaymentStatusInquiryId(s)) {
            return s;
        }
    }
    return undefined;
}
function extractOrderIdFromUpaymentsExtraData(raw) {
    if (!raw) {
        return null;
    }
    const match = raw.match(/orderId=([0-9a-fA-F-]{36})/);
    return match?.[1] ?? null;
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