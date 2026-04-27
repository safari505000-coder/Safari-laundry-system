import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  CashStatus,
  GeneralLedgerEntryType,
  OrderStatus,
  PosPaymentMethod,
  Prisma,
  SafariRole,
} from '@prisma/client';
import {
  CustomerLedgerService,
  type OrderWalletSettlementPrefetch,
} from '../../customer-ledger/customer-ledger.service';
import { CustomerNotificationsService } from '../../customer-notifications/customer-notifications.service';
import { GeneralLedgerService } from '../../general-ledger/general-ledger.service';
import { InventoryService } from '../../inventory/inventory.service';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveCustomerPhoneForNotify } from '../validation/kuwait-customer-phone';
import { cashStatusForPaymentMethod } from '../utils/cash-status-for-method';

export type CreatePaymentLinkParams = {
  orderId: string;
  amount: Prisma.Decimal;
  customerPhone: string;
  customerName?: string;
  customerEmail?: string;
  customerUniqueId?: string;
};

export type CreatePaymentLinkResult = {
  url: string;
  reference?: string;
  trackId?: string;
};

/**
 * V1.7.0 — Shape of the `data` block UPayments returns from
 * `GET /api/v1/get-payment-status/{trackId}`. Trimmed to the fields
 * we actually consume; extra fields (auth, tranId, postDate, etc.)
 * are kept around in `posGatewayMetadata` for audit but never read.
 */
type UPaymentsInquiryData = {
  trackId?: string;
  paymentId?: string;
  result?: string;
  transactionId?: string;
  reference?: string;
  amount?: string | number;
  customerExtraData?: string;
  order?: { id?: string; reference?: string };
};

/**
 * UPayments `/api/v1/charge` JSON shape is not stable across environments:
 * official docs' examples only show `data.link` while a track is required
 * for `get-payment-status`. We accept many key spellings, numeric values, and
 * perform a shallow recursive walk — production payloads have placed the id
 * under `payment_id`, `invoice_id`, nested `payment`, etc.
 */
function looksLikeOurOrderUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s.trim(),
  );
}

function coerceStringishTrackValue(v: unknown): string | undefined {
  if (typeof v === 'string') {
    const t = v.trim();
    return t || undefined;
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (!Number.isInteger(v) && v > 1e15) {
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

/** Known spellings from UPayments and partner gateways (KNET / uInterface). */
const UPAYMENTS_TRACK_LIKE_KEYS: readonly string[] = [
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
  'session_id',
  'sessionId',
  'SessionId',
  'transaction_id',
  'transactionId',
  'TransactionId',
  'tran_id',
  'tranId',
  'receipt_id',
  'receiptId',
  'receiptid',
  'upayment_id',
  'uPaymentId',
];

function isPlausibleTrackValue(s: string, key: string): boolean {
  if (s.length < 5 || s.length > 128) {
    return false;
  }
  if (s.startsWith('http') || s.startsWith('//')) {
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

function tryParseTrackIdFromRecord(o: unknown): string | undefined {
  if (!o || typeof o !== 'object') {
    return undefined;
  }
  const r = o as Record<string, unknown>;
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

/**
 * Deep search (depth-limited) for any nested object that carries a track-like key.
 * Skips obvious non-ids (URLs, our UUID order ids in known fields).
 */
function deepFindUpaymentsTrackId(node: unknown, depth: number): string | undefined {
  if (depth > 12 || node == null) {
    return undefined;
  }
  if (Array.isArray(node)) {
    for (const el of node) {
      const t = deepFindUpaymentsTrackId(el, depth + 1);
      if (t) {
        return t;
      }
    }
    return undefined;
  }
  if (typeof node !== 'object') {
    return undefined;
  }
  const o = node as Record<string, unknown>;
  for (const k of UPAYMENTS_TRACK_LIKE_KEYS) {
    if (!(k in o)) {
      continue;
    }
    const s = coerceStringishTrackValue(o[k]);
    if (s && isPlausibleTrackValue(s, k)) {
      return s;
    }
  }
  if (depth > 0) {
    for (const k of ['id', 'Id', 'ID'] as const) {
      if (!(k in o)) {
        continue;
      }
      const s = coerceStringishTrackValue(o[k]);
      if (s && isPlausibleTrackValue(s, 'id')) {
        return s;
      }
    }
  }
  for (const [k, v] of Object.entries(o)) {
    if (TRACK_KEY_NAME_HINT.test(k)) {
      const s = coerceStringishTrackValue(v);
      if (s && isPlausibleTrackValue(s, k)) {
        return s;
      }
    }
  }
  for (const v of Object.values(o)) {
    if (v != null && typeof v === 'object') {
      const t = deepFindUpaymentsTrackId(v, depth + 1);
      if (t) {
        return t;
      }
    }
  }
  return undefined;
}

/**
 * Keep this aligned with UPayments partner gateways (Apiv2, uInterface, KPay).
 * Real observed production shape (Apr 2026): `data.link` is the ONLY field,
 * and the id sits in the URL as `session_id`.
 */
const TRACK_URL_QUERY_KEYS: readonly string[] = [
  'track_id',
  'trackId',
  'TrackID',
  'trackid',
  'TrackId',
  'session_id',
  'sessionId',
  'SessionId',
  'payment_id',
  'paymentId',
  'PaymentId',
  'invoice_id',
  'invoiceId',
];

function tryParseTrackIdFromPaymentUrl(link: string): string | undefined {
  if (!link || typeof link !== 'string') {
    return undefined;
  }
  try {
    const u = new URL(link);
    for (const key of TRACK_URL_QUERY_KEYS) {
      const v = u.searchParams.get(key);
      if (v?.trim()) {
        return v.trim();
      }
    }
  } catch {
    // relative or non-standard URL; fall through to regex
  }
  const m = new RegExp(
    `[?&](?:${TRACK_URL_QUERY_KEYS.join('|')})=([^&]+)`,
    'i',
  ).exec(link);
  if (m?.[1]) {
    try {
      return decodeURIComponent(m[1].trim());
    } catch {
      return m[1].trim();
    }
  }
  return undefined;
}

/**
 * @param data — typically `json.data` from the charge response (may be nested).
 */
function extractUpaymentsChargeTrackId(
  data: unknown,
  paymentUrl: string,
): string | undefined {
  let t = tryParseTrackIdFromRecord(data);
  if (t) {
    return t;
  }
  if (data && typeof data === 'object' && 'data' in (data as object)) {
    t = tryParseTrackIdFromRecord(
      (data as { data?: unknown }).data,
    );
    if (t) {
      return t;
    }
  }
  t = tryParseTrackIdFromPaymentUrl(paymentUrl);
  if (t) {
    return t;
  }
  t = deepFindUpaymentsTrackId(data, 0);
  return t;
}

/**
 * Last-resort: parse `track_id` / `payment_id` from raw body so 15+ digit ids
 * are not corrupted by JSON number parsing (`Number` precision loss).
 */
function extractTrackIdFromChargeRawJsonText(raw: string): string | undefined {
  const quotedPatterns: RegExp[] = [
    /"track_?id"\s*:\s*"([^"]{5,128})"/i,
    /"payment_?id"\s*:\s*"([^"]{5,128})"/i,
    /"PaymentId"\s*:\s*"([^"]{5,128})"/,
    /"invoice_?id"\s*:\s*"([^"]{5,128})"/i,
  ];
  for (const re of quotedPatterns) {
    const m = re.exec(raw);
    const s = m?.[1]?.trim();
    if (
      s &&
      !s.startsWith('http') &&
      !looksLikeOurOrderUuid(s) &&
      isPlausibleTrackValue(s, 'raw')
    ) {
      return s;
    }
  }
  const numM = /"(?:track_?id|payment_?id|invoice_?id|session_?id)"\s*:\s*(\d{10,24})\b/.exec(
    raw,
  );
  if (numM?.[1]) {
    return numM[1];
  }
  return undefined;
}

/** Payment landing URL: UPayments and partners vary between `link`, `url`, `paymentUrl`. */
function resolveUpaymentsChargePaymentUrl(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') {
    return undefined;
  }
  const d = data as Record<string, unknown>;
  for (const key of [
    'link',
    'url',
    'paymentUrl',
    'paymentLink',
    'href',
    'redirectUrl',
    'redirect_url',
  ]) {
    const v = d[key];
    if (typeof v !== 'string') {
      continue;
    }
    const t = v.trim();
    if (t.startsWith('http://') || t.startsWith('https://')) {
      return t;
    }
  }
  return undefined;
}

@Injectable()
export class PaymentsService implements OnModuleInit {
  private readonly logger = new Logger(PaymentsService.name);
  private prodFirstMockLinkLogged = false;
  private readonly apiBase: string;
  private readonly apiKey: string;
  private readonly merchantId: string;
  private readonly secret: string;
  private readonly callbackPublicUrl: string;
  private readonly webAppUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly customerLedger: CustomerLedgerService,
    private readonly generalLedger: GeneralLedgerService,
    private readonly inventory: InventoryService,
    private readonly customerNotifications: CustomerNotificationsService,
  ) {
    this.apiBase = (process.env.PAYMENTS_API_BASE_URL ?? '').replace(
      /\/$/,
      '',
    );
    this.apiKey = process.env.PAYMENTS_API_KEY ?? '';
    this.merchantId = process.env.PAYMENTS_MERCHANT_ID ?? '';
    this.secret = process.env.PAYMENTS_SECRET ?? '';
    this.callbackPublicUrl = (process.env.PAYMENTS_CALLBACK_PUBLIC_URL ?? '')
      .replace(/\/$/, '');
    this.webAppUrl = (
      process.env.PUBLIC_WEB_APP_URL ?? 'http://localhost:5173'
    ).replace(/\/$/, '');
  }

  private looksLikeLocalHost(url: string): boolean {
    return /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(url);
  }

  onModuleInit(): void {
    const inProd = process.env.NODE_ENV === 'production';
    if (inProd && !this.isPublicMockCheckoutAvailable()) {
      if (this.looksLikeLocalHost(this.webAppUrl)) {
        this.logger.error(
          'PAYMENTS: PUBLIC_WEB_APP_URL is localhost (or loopback) while real UPayments is enabled. After pay, the gateway redirects the customer to this URL — phones cannot open it. Set PUBLIC_WEB_APP_URL to your public SPA (e.g. https://www.safariomni.com) and redeploy.',
        );
      }
      if (!this.callbackPublicUrl) {
        const fallback = (process.env.PUBLIC_API_URL ?? '').replace(/\/$/, '');
        if (!fallback || this.looksLikeLocalHost(fallback)) {
          this.logger.error(
            'PAYMENTS: PAYMENTS_CALLBACK_PUBLIC_URL is unset and PUBLIC_API_URL is missing or not internet-reachable. UPayments cannot POST /api/payments/callback; orders may stay unpaid. Set PAYMENTS_CALLBACK_PUBLIC_URL to the public https base of this API (same as deploy/render-production.env).',
          );
        }
      } else if (this.looksLikeLocalHost(this.callbackPublicUrl)) {
        this.logger.error(
          'PAYMENTS: PAYMENTS_CALLBACK_PUBLIC_URL must be a public https host — not localhost. UPayments server-to-server callback will never reach your app.',
        );
      }
    }
    if (this.isPublicMockCheckoutAvailable()) {
      const inProd = process.env.NODE_ENV === 'production';
      if (inProd) {
        this.logger.warn(
          'PAYMENTS: mock checkout is active in production — links go to /api/payments/mock-checkout, not UPayments. Set PAYMENTS_API_BASE_URL (e.g. https://apiv2api.upayments.com), PAYMENTS_API_KEY, PAYMENTS_CALLBACK_PUBLIC_URL, ensure PAYMENTS_MOCK is not true, then redeploy.',
        );
      } else {
        this.logger.log(
          'PAYMENTS: mock / dev link mode (set PAYMENTS_API_BASE_URL for real UPayments).',
        );
      }
    } else if (!this.apiKey.trim()) {
      this.logger.warn(
        'PAYMENTS: PAYMENTS_API_KEY is empty — /charge will fail when creating payment links.',
      );
    } else {
      this.logger.log('PAYMENTS: UPayments hosted links enabled.');
    }
  }

  /** PAYMENTS_MOCK=true /1 / yes */
  paymentsMockExplicit(): boolean {
    const m = process.env.PAYMENTS_MOCK?.trim().toLowerCase();
    return m === '1' || m === 'true' || m === 'yes';
  }

  /** No gateway base URL → use in-process mock checkout (local dev). */
  usePlaceholderGateway(): boolean {
    return !this.apiBase.trim();
  }

  /** Mock HTML page + unsigned dev callback allowed. */
  isPublicMockCheckoutAvailable(): boolean {
    return this.paymentsMockExplicit() || this.usePlaceholderGateway();
  }

  allowDevMockCallback(body: { devMock?: boolean }): boolean {
    return Boolean(body.devMock) && this.isPublicMockCheckoutAvailable();
  }

  /**
   * V1.7.0 — UPayments `POST /api/v1/charge` (UInterfaceV2).
   *
   * Creates a hosted payment link that shows every channel enabled
   * on the merchant's UPayments account (KNET, Visa/MasterCard,
   * Apple Pay, Google Pay, Samsung Pay). Falls through to an in-
   * process mock checkout page when `PAYMENTS_API_BASE_URL` is unset
   * or `PAYMENTS_MOCK=true`.
   *
   * Docs: https://developers.upayments.com/reference/addcharge
   */
  async createPaymentLink(
    params: CreatePaymentLinkParams,
  ): Promise<CreatePaymentLinkResult> {
    if (this.isPublicMockCheckoutAvailable()) {
      const base = (
        process.env.PUBLIC_API_URL ?? 'http://localhost:3000'
      ).replace(/\/$/, '');
      const url = `${base}/api/payments/mock-checkout?orderId=${encodeURIComponent(params.orderId)}`;
      if (process.env.NODE_ENV === 'production' && !this.prodFirstMockLinkLogged) {
        this.prodFirstMockLinkLogged = true;
        this.logger.warn(
          'PAYMENTS: ONLINE order uses mock payment URL — set PAYMENTS_API_BASE_URL and PAYMENTS_API_KEY on the host; unset PAYMENTS_MOCK. (This banner once; each order still logs below.)',
        );
      }
      this.logger.log(
        `Mock payment link for ${params.orderId} (set PAYMENTS_API_BASE_URL for UPayments)`,
      );
      return { url, reference: 'mock', trackId: `mock-${params.orderId}` };
    }

    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'Payment link is not configured (PAYMENTS_API_KEY missing)',
      );
    }

    const notificationUrl = this.callbackPublicUrl
      ? `${this.callbackPublicUrl}/api/payments/callback`
      : `${process.env.PUBLIC_API_URL ?? 'http://localhost:3000'}/api/payments/callback`;
    // No query string on return/cancel: UPayments appends `?key=value&...` to
    // the URL; if we already used `?orderId=…`, their join used to produce
    // `...?orderId=…?payment_id=…` and browsers broke the success page. Our
    // SPA reads `orderId` from `requested_order_id` / `trn_udf` on redirect.
    const returnUrl = `${this.webAppUrl}/payment/success`;
    const cancelUrl = `${this.webAppUrl}/payment/failed`;

    // UPayments mandates numeric amount with up to 3 decimals (KWD fils).
    // We pass as Number to match their schema; the authoritative
    // amount is always re-read from the DB at finalize time, so tiny
    // rounding drift here never silently mismatches revenue.
    const amount = Number(params.amount.toFixed(3));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Invalid order amount for payment link');
    }

    const customerName =
      (params.customerName?.trim() || 'Safari Customer').slice(0, 100);
    const customerEmail =
      (params.customerEmail?.trim() ||
        `noreply+${params.orderId.slice(0, 8)}@safariomni.com`).slice(0, 120);
    const customerMobile = normalizeKwPhone(params.customerPhone || '');
    const customerUniqueId = (
      params.customerUniqueId?.trim() || params.orderId
    ).slice(0, 20);

    // `customerExtraData` is echoed back verbatim by UPayments in
    // webhook + inquiry responses. We stuff our orderId there so we
    // can correlate the webhook to the internal order even if the
    // `order.id` field is ever dropped from the callback payload.
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
      // Empty `src` tells UPayments to surface every payment method
      // enabled on the merchant account (KNET + cards + wallets).
      paymentGateway: { src: '' },
      language: 'en',
      // `reference.id` is capped at 35 chars by UPayments — a plain
      // UUID is 36. Drop the dashes and prefix with `o` so the value
      // still round-trips uniquely (32 hex chars, always < 35) and
      // our correlation by `customerExtraData` is unaffected.
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
      // V19.22.2 — 24h window. Keeps the driver's Field Collection
      // Tracker badge truthful: a link shown as "قيد الانتظار" must
      // still be payable on the gateway. If the customer hasn't paid
      // within 24 hours, the driver must chase them in person or
      // the Call Center re-issues a fresh link through the Call
      // Center island. Must remain in sync with
      // `PAYMENT_LINK_VALIDITY_HOURS` in `orders.service.ts`.
      paymentLinkExpiryInMinutes: 60 * 24,
    };

    const chargeUrl = `${this.apiBase}/api/v1/charge`;
    this.logger.log(
      `UPayments /charge → ${chargeUrl} (order=${params.orderId}, amount=${amount})`,
    );
    const upaymentsFetchTimeoutMs = Number(
      process.env.PAYMENTS_UPAYMENTS_TIMEOUT_MS?.trim() || '60000',
    );
    let res: Response;
    try {
      res = await fetch(chargeUrl, {
        method: 'POST',
        signal: AbortSignal.timeout(
          Number.isFinite(upaymentsFetchTimeoutMs) && upaymentsFetchTimeoutMs > 0
            ? upaymentsFetchTimeoutMs
            : 60_000,
        ),
        headers: {
          // UPayments returns its HTML landing page unless Accept is
          // explicitly set to JSON — the Content-Type on its own is not
          // enough (see developers.upayments.com → "Test Mode").
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (e: unknown) {
      const root =
        e instanceof Error && (e as Error & { cause?: unknown }).cause
          ? String((e as Error & { cause: unknown }).cause)
          : '';
      const msg = e instanceof Error ? `${e.message}${root ? ` ${root}` : ''}` : String(e);
      this.logger.error(`UPayments /charge fetch failed: ${msg}`);
      throw new ServiceUnavailableException(
        'Cannot reach UPayments (network error or timeout). Check internet, firewall, and PAYMENTS_API_BASE_URL. For local dev without gateway access, set PAYMENTS_MOCK=true in .env.',
      );
    }

    const text = await res.text();
    let json: {
      status?: boolean;
      message?: string;
      data?: { link?: string; trackId?: string; [k: string]: unknown };
    };
    try {
      json = text ? (JSON.parse(text) as typeof json) : {};
    } catch {
      this.logger.error(
        `UPayments non-JSON response (status=${res.status}, ct=${res.headers.get('content-type')}): ${text.slice(0, 300)}`,
      );
      throw new BadRequestException(
        'UPayments gateway returned a non-JSON response',
      );
    }

    if (!res.ok || json.status === false) {
      const msg = json.message ?? text.slice(0, 500);
      this.logger.error(
        `UPayments /charge failed (${res.status}) for ${params.orderId}: ${msg}`,
      );
      throw new BadRequestException(
        `Payments gateway error (${res.status}): ${msg}`,
      );
    }

    const dataBlock: unknown = json.data;
    const url = resolveUpaymentsChargePaymentUrl(dataBlock);
    if (!url) {
      throw new BadRequestException(
        'UPayments response missing payment link (`data.link` / `data.url` / similar)',
      );
    }

    let trackId = extractUpaymentsChargeTrackId(dataBlock, url);
    if (!trackId) {
      trackId = deepFindUpaymentsTrackId(json, 0);
    }
    if (!trackId) {
      trackId = tryParseTrackIdFromRecord(json);
    }
    if (!trackId) {
      trackId = extractTrackIdFromChargeRawJsonText(text);
    }
    if (!trackId) {
      const dataKeys =
        dataBlock && typeof dataBlock === 'object'
          ? Object.keys(dataBlock as object).join(',')
          : 'n/a';
      this.logger.error(
        `UPayments /charge: cannot resolve trackId for order=${params.orderId}. data keys=[${dataKeys}] snippet=${text.slice(0, 2500)}`,
      );
      throw new BadRequestException(
        'UPayments did not return a verifiable track id (needed for recheck and webhooks). Check gateway /charge JSON or contact UPayments support.',
      );
    }

    return {
      url,
      reference: trackId,
      trackId,
    };
  }

  /**
   * V1.7.0 — Server-to-Server inquiry. Called from the webhook
   * handler so we never trust the webhook body blindly; the
   * authoritative payment state is whatever UPayments reports for
   * this `trackId` via its own authenticated endpoint.
   *
   * Docs: `GET /api/v1/get-payment-status/{trackId}` (UInterfaceV2).
   */
  async fetchGatewayStatus(
    trackId: string,
  ): Promise<{ ok: boolean; data: UPaymentsInquiryData; raw: unknown }> {
    if (this.usePlaceholderGateway()) {
      // Dev / mock — no external call. Caller decides what to do
      // with the empty payload; the mock-callback path uses the
      // webhook body directly instead.
      return { ok: false, data: {}, raw: null };
    }
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'Payment inquiry is not configured (PAYMENTS_API_KEY missing)',
      );
    }
    const statusUrl = `${this.apiBase}/api/v1/get-payment-status/${encodeURIComponent(trackId)}`;
    const upaymentsFetchTimeoutMs = Number(
      process.env.PAYMENTS_UPAYMENTS_TIMEOUT_MS?.trim() || '60000',
    );
    let res: Response;
    try {
      res = await fetch(statusUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(
          Number.isFinite(upaymentsFetchTimeoutMs) && upaymentsFetchTimeoutMs > 0
            ? upaymentsFetchTimeoutMs
            : 60_000,
        ),
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`UPayments get-payment-status fetch failed: ${msg}`);
      return { ok: false, data: {}, raw: { fetchError: msg } };
    }
    const text = await res.text();
    let json: {
      status?: boolean;
      message?: string;
      data?: UPaymentsInquiryData;
    };
    try {
      json = text ? (JSON.parse(text) as typeof json) : {};
    } catch {
      this.logger.error(
        `UPayments inquiry returned non-JSON (${res.status}): ${text.slice(0, 200)}`,
      );
      return { ok: false, data: {}, raw: text };
    }
    if (!res.ok || json.status === false || !json.data) {
      this.logger.warn(
        `UPayments inquiry failed for ${trackId}: ${json.message ?? text.slice(0, 200)}`,
      );
      return { ok: false, data: json.data ?? {}, raw: json };
    }
    return { ok: true, data: json.data, raw: json };
  }

  /**
   * Legacy HMAC signer. Kept only so the callback signature check
   * remains functional for gateways that continue to sign webhooks
   * `hex(HMAC_SHA256(secret, "${orderId}|${status}|${amount}"))`.
   * UPayments does NOT use this scheme — for UPayments we rely on
   * the Server-to-Server inquiry in `fetchGatewayStatus`.
   */
  private signPayload(payload: string): string {
    return createHmac('sha256', this.secret || this.apiKey)
      .update(payload)
      .digest('hex');
  }

  /** Back-compat: still honoured for non-UPayments gateways + devMock. */
  verifyIntegratedCallback(dto: {
    orderId: string;
    status: string;
    amount?: string;
    signature?: string;
  }): boolean {
    if (!this.secret) {
      if (process.env.NODE_ENV === 'production') {
        this.logger.error('PAYMENTS_SECRET is required in production');
        return false;
      }
      this.logger.warn(
        'PAYMENTS_SECRET missing — callback signature not verified (dev only)',
      );
      return true;
    }
    if (!dto.signature) {
      return false;
    }
    const payload = `${dto.orderId}|${dto.status}|${dto.amount ?? ''}`;
    const expected = createHmac('sha256', this.secret)
      .update(payload)
      .digest('hex');
    try {
      const a = Buffer.from(expected, 'utf8');
      const b = Buffer.from(dto.signature, 'utf8');
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  /**
   * V1.7.0 — UPayments result mapping.
   *
   * `CAPTURED` / `AUTHORIZED` / `SUCCESS` = money captured → success.
   * Everything else (CANCELED, DECLINED, FAILED, TIMEOUT, …) = failed.
   * Case-insensitive so we don't get caught by provider casing
   * quirks.
   */
  normalizeCallbackStatus(status: string): 'success' | 'failed' {
    const s = status.trim().toLowerCase();
    if (
      s === 'success' ||
      s === 'paid' ||
      s === 'completed' ||
      s === 'captured' ||
      s === 'authorized'
    ) {
      return 'success';
    }
    return 'failed';
  }

  /**
   * `/api/v1/charge` often returns only `data.link?session_id=…` while
   * `get-payment-status` and webhooks use the v2 `track_id` (return URL + POST body).
   * This helper runs the inquiry + finalizes if CAPTURED, and
   * `finalizeSinglePaidOrderFromGateway` will persist the inquiry-capable
   * `trackId` to `posGatewayTrackId` when the callback payload includes it.
   */
  async tryFinalizeOrderIfUpaymentsCaptured(
    orderId: string,
    inquiryTrackId: string,
    source: string,
  ): Promise<{
    finalized: boolean;
    gatewayResult: string | null;
    inquiryRaw: unknown;
  }> {
    const clean = inquiryTrackId.trim();
    if (!clean) {
      return { finalized: false, gatewayResult: null, inquiryRaw: null };
    }
    const inquiry = await this.fetchGatewayStatus(clean);
    const gr = inquiry.data.result?.toString() ?? null;
    if (!inquiry.ok) {
      return { finalized: false, gatewayResult: gr, inquiryRaw: inquiry.raw };
    }
    if (this.normalizeCallbackStatus(inquiry.data.result ?? '') !== 'success') {
      return { finalized: false, gatewayResult: gr, inquiryRaw: inquiry.raw };
    }
    const fromInq =
      inquiry.data.order?.id?.trim() ||
      extractOrderIdFromUpaymentsExtraData(inquiry.data.customerExtraData);
    if (fromInq && fromInq !== orderId) {
      this.logger.warn(
        `UPayments inquiry order mismatch: urlOrder=${orderId} inquiryOrder=${fromInq} trackPrefix=${clean.slice(0, 20)}…`,
      );
      return { finalized: false, gatewayResult: gr, inquiryRaw: inquiry.raw };
    }
    await this.finalizePaidOrderFromGateway(
      orderId,
      {
        provider: 'upayments',
        trackId: clean,
        source,
        paymentId: inquiry.data.paymentId ?? null,
        tranId: inquiry.data.transactionId ?? null,
        result: inquiry.data.result ?? null,
        amount: String(inquiry.data.amount ?? ''),
        inquiryRaw: inquiry.raw,
      } as never,
    );
    return { finalized: true, gatewayResult: gr, inquiryRaw: inquiry.raw };
  }

  /**
   * V1.6.0 — Universal payment link for ANY unpaid non-canceled order.
   *
   * Returns the existing `posHostedPaymentUrl` if one was already generated
   * (idempotent + safe to call from the "Payment link" button on the
   * Collections page). Otherwise calls the gateway to mint a new link and
   * persists it on the order row (including `posGatewayTrackId` for
   * later webhook correlation) before returning.
   *
   * Does NOT flip `posPaymentMethod` yet — the method auto-switches to
   * `ONLINE` only when the gateway callback confirms a successful payment
   * (see `finalizeSinglePaidOrderFromGateway`). Until then the order keeps
   * its original method so the Collections table still shows it correctly.
   */
  async ensurePaymentLinkForUnpaidOrder(
    orderId: string,
  ): Promise<CreatePaymentLinkResult> {
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
      throw new BadRequestException('Order not found');
    }
    if (order.status === OrderStatus.CANCELED) {
      throw new BadRequestException('Order is canceled');
    }
    if (order.cashStatus !== CashStatus.UNPAID || order.walletSettledAt) {
      throw new BadRequestException('Order is already paid');
    }
    // Idempotent: same URL + trackId. Legacy POS rows (pre-fix) may have a URL
    // without `posGatewayTrackId` — recheck cannot run; re-mint a gateway session
    // so Collections "Send payment link" can repair the row.
    if (order.posHostedPaymentUrl && order.posGatewayTrackId) {
      return {
        url: order.posHostedPaymentUrl,
        trackId: order.posGatewayTrackId,
      };
    }
    if (order.posHostedPaymentUrl && !order.posGatewayTrackId) {
      this.logger.warn(
        `Payment link missing trackId (repair): orderId=${order.id} — creating new UPayments session`,
      );
    }
    const phone =
      order.customer.phone?.trim() || order.customer.phone2?.trim() || '';
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
        } as Prisma.InputJsonValue,
      },
    });
    const persisted = await this.prisma.order.findUnique({
      where: { id: order.id },
      select: { posGatewayTrackId: true },
    });
    if (!persisted?.posGatewayTrackId) {
      this.logger.error(
        `posGatewayTrackId not readable after update orderId=${order.id}`,
      );
      throw new InternalServerErrorException(
        'Failed to persist gateway track id. Check database and Order.posGatewayTrackId column.',
      );
    }
    return link;
  }

  /**
   * V1.7.0 — Helper for the webhook handler. Looks up the order row
   * tied to the given `trackId` (fast path: indexed column) so the
   * controller can finalize without an extra Prisma call.
   */
  async findOrderByTrackId(trackId: string): Promise<string | null> {
    const row = await this.prisma.order.findFirst({
      where: { posGatewayTrackId: trackId },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /**
   * After gateway confirms payment: complete order + wallet settlement (same as instant POS).
   * `referenceId` may be a single order id, or a PosPaymentBundle id (multi-invoice POS).
   * `gatewayMetadata` (optional) is merged into `Order.posGatewayMetadata`
   * as a `callback.*` sub-tree for audit.
   */
  async finalizePaidOrderFromGateway(
    referenceId: string,
    gatewayMetadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    const bundle = await this.prisma.posPaymentBundle.findUnique({
      where: { id: referenceId },
      include: {
        orders: {
          where: { status: OrderStatus.PENDING },
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

  private async finalizeSinglePaidOrderFromGateway(
    orderId: string,
    gatewayMetadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    const didFinalize = await this.prisma.$transaction(
      async (tx) => {
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
          throw new BadRequestException('Order not found');
        }
        if (order.walletSettledAt) {
          // Idempotent — already settled (likely a replayed webhook).
          return false;
        }
        if (order.status === OrderStatus.CANCELED) {
          throw new BadRequestException(
            'Order is canceled — cannot finalize a link payment for it',
          );
        }

        // V1.6.2 — every gateway-finalized order reached this point by
        // definition from the UNPAID bucket (we passed the walletSettledAt
        // guard and the cashStatus check upstream). That means EVERY row
        // we write here counts as "debt collected today", regardless of
        // whether the original method was CASH, KNET, DEBT_ON_ACCOUNT,
        // PAYMENT_LINK, or ONLINE. Tagging was previously conditional on
        // `originalMethod !== ONLINE && !== PAYMENT_LINK`, which silently
        // excluded first-time POS online sales and pre-minted link orders
        // from the Green card — that's the "Red went down but Green
        // stayed 0" bug.
        const originalMethod = order.posPaymentMethod;

        const completedAt = new Date();
        const mergedGatewayMetadata = mergeGatewayMetadata(
          order.posGatewayMetadata,
          gatewayMetadata,
          completedAt,
        );
        const inquiryCapableTrackId =
          extractTrackIdFromFinalizeGatewayMetadata(gatewayMetadata);
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.COMPLETED,
            // V19.11.3 — hosted link is settled by the gateway; the
            // driver never touches the money, so don't mark it as cash.
            cashStatus: cashStatusForPaymentMethod(PosPaymentMethod.ONLINE),
            completedAt,
            posPaymentMethod: PosPaymentMethod.ONLINE,
            walletSettledAt: null,
            ...(inquiryCapableTrackId
              ? { posGatewayTrackId: inquiryCapableTrackId }
              : {}),
            ...(mergedGatewayMetadata
              ? { posGatewayMetadata: mergedGatewayMetadata }
              : {}),
          },
        });

        // A driver may not exist on orders that were booked through the
        // office (e.g. Cash-on-account invoices later paid online). Fall
        // back to a deterministic performer so the settlement row is
        // always attributable.
        const performerId = order.driverId ?? (await this.resolveFallbackPerformer(tx));
        if (!performerId) {
          throw new BadRequestException(
            'No performer available to attribute the link payment to',
          );
        }

        const prefetch: OrderWalletSettlementPrefetch = {
          customerId: order.customerId,
          totalPrice: order.totalPrice,
          // Pass the *new* method so the wallet math treats this as
          // "external covers shortfall" (matches a regular ONLINE sale).
          posPaymentMethod: PosPaymentMethod.ONLINE,
          walletSettledAt: null,
          skipPerformerLookup: true,
        };

        const extraMetadata: Record<string, Prisma.JsonValue> = {
          // These four keys are what the "Collected Today" KPI and the
          // Accountant's Unified-Ledger reports read from. `debtSettled`
          // is the magic key the green card sums; it MUST be a string so
          // `extractDebtSettled()` picks it up.
          debtSettled: order.totalPrice.toString(),
          debtSettlementViaLink: true,
          originalPaymentMethod: originalMethod ?? null,
          reportingCategory: 'DEBT_COLLECTION_VIA_LINK',
        };

        await this.customerLedger.applyOrderWalletSettlementForCompletedOrder(
          tx,
          orderId,
          performerId,
          prefetch,
          extraMetadata,
        );

        // A3.D1 — every gateway-finalized order is a real revenue event
        // and must land in the GL just like instant POS checkout. Without
        // this append, the Unified Ledger stream silently undercounts
        // revenue vs. the Executive P&L (which reads `Order.totalPrice`
        // on `completedAt`). See docs/DUSTUR_TASHGHIL_SAFARI.md §1.
        await this.generalLedger.append(tx, {
          entryType: GeneralLedgerEntryType.POS_SALE_COMPLETED,
          amount: order.totalPrice,
          memo: 'POS checkout (hosted link)',
          orderId,
          customerId: order.customerId,
          actorUserId: performerId,
          metadata: {
            posPaymentMethod: PosPaymentMethod.ONLINE,
            originalPaymentMethod: originalMethod ?? null,
            source: 'GATEWAY_CALLBACK',
          },
        });

        // Dastur §7 — gateway completion also emits the STOCK_OUT
        // side-effects. For driver-less office invoices the fallback
        // performer has no branch, so the helper silently no-ops.
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
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
    if (didFinalize) {
      this.emitPaymentConfirmedNotify(orderId);
    }
  }

  /**
   * After the order is fully paid (any channel: gateway, CC mark-paid, or
   * POS instant settlement), schedule the same customer WhatsApp as the
   * link callback (thank-you + optional `/r/:orderId` rating URL).
   */
  schedulePaymentConfirmedCustomerNotify(orderId: string): void {
    this.emitPaymentConfirmedNotify(orderId);
  }

  /**
   * WhatsApp: payment-thanks + public `/r/:orderId` rating link (when
   * `PUBLIC_WEB_APP_URL` is set). Phone resolution matches invoice notify
   * (Kuwait mobile preferred, else first non-empty on file).
   */
  private emitPaymentConfirmedNotify(orderId: string): void {
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
        const phone = resolveCustomerPhoneForNotify(
          row.customer.phone,
          row.customer.phone2,
        );
        if (!phone.trim()) {
          this.logger.log(
            `Payment confirmed notify skipped: no customer phone on file for order ${row.id.slice(0, 8)}…`,
          );
          return;
        }
        const orderLabel =
          row.serialNumber?.trim() ||
          row.invoiceNumber?.trim() ||
          `#${row.id.slice(0, 8)}`;
        const base = (process.env.PUBLIC_WEB_APP_URL ?? '')
          .replace(/\/$/, '')
          .trim();
        const ratingUrl =
          base ? `${base}/r/${encodeURIComponent(row.id)}` : undefined;
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

  /**
   * V1.6.0 — when an office/call-center link payment lands for an order
   * that was never assigned to a driver (e.g. pure debt collection on a
   * DEBT_ON_ACCOUNT invoice), pick the first OWNER we find so the ledger
   * row has a valid `performedById`. Deterministic and cheap — called at
   * most once per link callback.
   */
  private async resolveFallbackPerformer(
    tx: Prisma.TransactionClient,
  ): Promise<string | null> {
    const owner = await tx.user.findFirst({
      where: { safariRole: SafariRole.OWNER },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return owner?.id ?? null;
  }

  /**
   * V1.6.9 — Call Center "تم الدفع" manual confirmation.
   *
   * Mirrors `finalizeSinglePaidOrderFromGateway` except the final
   * `posPaymentMethod` comes from the agent (CASH | KNET | PAYMENT_LINK
   * | ONLINE) instead of being hard-coded to ONLINE, and the performer
   * is the Call Center agent that pressed the button (falls back to the
   * assigned driver, then the owner, so the ledger row always attributes
   * cleanly).
   *
   * Idempotent: if the order was already settled (`walletSettledAt`
   * set) we just return the current snapshot. If the order is canceled
   * we throw — you cannot mark a canceled order as paid.
   */
  async manuallyMarkOrderPaidByMethod(args: {
    orderId: string;
    method: Exclude<
      PosPaymentMethod,
      'SUBSCRIPTION_WALLET' | 'DEBT_ON_ACCOUNT'
    >;
    performedByUserId: string;
  }): Promise<{
    orderId: string;
    alreadySettled: boolean;
    amountKd: string;
    posPaymentMethod: PosPaymentMethod;
  }> {
    const { orderId, method, performedByUserId } = args;
    const result = await this.prisma.$transaction(
      async (tx) => {
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
          throw new BadRequestException('Order not found');
        }
        if (order.status === OrderStatus.CANCELED) {
          throw new BadRequestException(
            'Order is canceled — cannot mark it as paid',
          );
        }
        if (order.walletSettledAt) {
          // Idempotent — the order is already settled. Return the
          // current snapshot so the UI can refresh without error.
          return {
            orderId: order.id,
            alreadySettled: true,
            amountKd: order.totalPrice.toFixed(3),
            posPaymentMethod:
              order.posPaymentMethod ?? PosPaymentMethod.CASH,
          };
        }

        const originalMethod = order.posPaymentMethod;
        const completedAt = new Date();
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.COMPLETED,
            // V19.11.3 — KNET / PAYMENT_LINK / ONLINE close electronically;
            // only CASH keeps the legacy PAID_TO_DRIVER state.
            cashStatus: cashStatusForPaymentMethod(method),
            completedAt,
            posPaymentMethod: method,
            walletSettledAt: null,
          },
        });

        // Prefer the agent so the ledger row is attributable to the
        // human who pressed the button. Fall back to the driver (if any)
        // and finally to an owner so we never fail for driver-less
        // DEBT_ON_ACCOUNT invoices collected by the office.
        const performerId =
          performedByUserId ??
          order.driverId ??
          (await this.resolveFallbackPerformer(tx));
        if (!performerId) {
          throw new BadRequestException(
            'No performer available to attribute the manual settlement to',
          );
        }

        const prefetch: OrderWalletSettlementPrefetch = {
          customerId: order.customerId,
          totalPrice: order.totalPrice,
          // Tell the wallet math to treat the settlement as "external
          // covers shortfall" so we do NOT add invoice debt for methods
          // that actually close the invoice (CASH/KNET/PAYMENT_LINK/
          // ONLINE). DEBT_ON_ACCOUNT and SUBSCRIPTION_WALLET are not in
          // the accepted `method` set and thus can never reach here.
          posPaymentMethod: method,
          walletSettledAt: null,
          skipPerformerLookup: true,
        };

        const extraMetadata: Record<string, Prisma.JsonValue> = {
          debtSettled: order.totalPrice.toString(),
          debtSettlementViaCallCenter: true,
          originalPaymentMethod: originalMethod ?? null,
          confirmedPaymentMethod: method,
          reportingCategory: 'DEBT_COLLECTION_MANUAL',
        };

        await this.customerLedger.applyOrderWalletSettlementForCompletedOrder(
          tx,
          orderId,
          performerId,
          prefetch,
          extraMetadata,
        );

        // A3.D1 — Call-Center "mark as paid" is also a real revenue event;
        // mirror the GL write that instant POS checkout performs so the
        // Unified Ledger + Executive P&L stay aligned.
        await this.generalLedger.append(tx, {
          entryType: GeneralLedgerEntryType.POS_SALE_COMPLETED,
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

        // Dastur §7 — also emit STOCK_OUT on call-center manual
        // completion. Branch priority: driver → agent → none.
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
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
    if (!result.alreadySettled) {
      this.emitPaymentConfirmedNotify(orderId);
    }
    return result;
  }
}

function normalizeKwPhone(phone: string): string {
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

function extractTrackIdFromFinalizeGatewayMetadata(
  meta: Prisma.InputJsonValue | undefined,
): string | undefined {
  if (meta == null || typeof meta !== 'object' || Array.isArray(meta)) {
    return undefined;
  }
  const m = meta as Record<string, unknown>;
  const t = m.trackId ?? m.TrackID;
  if (typeof t === 'string' && t.trim().length > 0) {
    return t.trim();
  }
  return undefined;
}

/** Same regex as in `payments.controller` — `orderId=<uuid>` in UPayments UDF. */
function extractOrderIdFromUpaymentsExtraData(
  raw: string | undefined,
): string | null {
  if (!raw) {
    return null;
  }
  const match = raw.match(/orderId=([0-9a-fA-F-]{36})/);
  return match?.[1] ?? null;
}

/**
 * V1.7.0 — merge the existing `Order.posGatewayMetadata` JSON (if
 * any) with the new callback payload, preserving the `charge.*`
 * branch added at link creation and appending a `callback.*` branch
 * with an ISO timestamp. Silently coerces unexpected shapes to a
 * plain object so we never store corrupt JSON.
 */
function mergeGatewayMetadata(
  existing: Prisma.JsonValue | null | undefined,
  incoming: Prisma.InputJsonValue | undefined,
  at: Date,
): Prisma.InputJsonValue | null {
  if (incoming === undefined || incoming === null) {
    return null;
  }
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? (existing as Record<string, Prisma.JsonValue>)
      : {};
  return {
    ...base,
    callback: {
      receivedAt: at.toISOString(),
      payload: incoming,
    },
  } as Prisma.InputJsonValue;
}
