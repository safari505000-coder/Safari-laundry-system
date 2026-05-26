import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
  Optional,
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
import { CustomerLedgerService } from '../../customer-ledger/customer-ledger.service';
import type { OrderWalletSettlementPrefetch } from '../../customer-ledger/customer-ledger.types';
import {
  type PaymentConfirmedCustomerScenario,
} from '../../customer-notifications/customer-notifications.service';
import { WhatsAppQueueService } from '../../customer-notifications/whatsapp-queue.service';
import { GeneralLedgerService } from '../../general-ledger/general-ledger.service';
import { InventoryService } from '../../inventory/inventory.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { MetricsService } from '../../observability/metrics.service';
import { APP_VERSION } from '../constants/app-version';
import { cashStatusForPaymentMethod } from '../utils/cash-status-for-method';
import {
  computeOrderRemainingBalancesBatch,
  INVOICE_REMAINING_TOLERANCE_KD,
} from '../../finance/debt-customer-aggregates.util';
import { DiscordAlertService } from './discord-alert.service';

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
 * `GET /api/v1/get-payment-status/{id}`. Official docs name the path
 * parameter **`track_id`**; the UPayments merchant dashboard often shows the
 * same value as **`trans_id`** / **`tran_id`**. We pass whichever id the
 * webhook or return URL supplied into that single path segment.
 *
 * Note: response field **`transactionId`** (when present) is metadata from
 * the gateway — it is **not** the same slot as dashboard `trans_id` for inquiry.
 */
type UPaymentsInquiryData = {
  trackId?: string;
  paymentId?: string;
  result?: string;
  transactionId?: string;
  reference?: string;
  amount?: string | number;
  currency?: string;
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
    if (!Number.isInteger(v)) {
      return undefined;
    }
    // JSON numbers beyond MAX_SAFE_INTEGER are corrupted — never stringify them
    // as a UPayments inquiry id (use quoted-string extraction from raw text).
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

/**
 * Known spellings from UPayments and partner gateways (KNET / uInterface).
 * **Order matters:** prefer dashboard `trans_id` / `tran_id` and docs `track_id`
 * before `payment_id` / `session_id` so we never persist a bogus long composite.
 */
const UPAYMENTS_TRACK_LIKE_KEYS: readonly string[] = [
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

/** Pure-digit UPayments `trans_id` / inquiry ids are short; longer runs are wrong-field picks or corrupted JSON. */
const UPAYMENTS_MAX_DIGIT_ONLY_INQUIRY_LEN = 32;

function isPlausibleTrackValue(s: string, key: string): boolean {
  if (s.length < 5 || s.length > 128) {
    return false;
  }
  if (s.startsWith('http') || s.startsWith('//')) {
    return false;
  }
  if (/^\d+$/.test(s) && s.length > UPAYMENTS_MAX_DIGIT_ONLY_INQUIRY_LEN) {
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

/**
 * True when the string is safe to pass to `GET …/get-payment-status/{id}` or
 * to persist as `Order.posGatewayTrackId`.
 */
export function isValidUpaymentsPaymentStatusInquiryId(s: string): boolean {
  const t = (s ?? '').trim();
  return isPlausibleTrackValue(t, 'inquiry');
}

/** For `/charge` only: never treat our Safari order UUID as a gateway inquiry id. */
function isSafeUpaymentsChargeInquiryCandidate(s: string): boolean {
  const t = (s ?? '').trim();
  if (!isValidUpaymentsPaymentStatusInquiryId(t)) {
    return false;
  }
  if (looksLikeOurOrderUuid(t)) {
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
function deepFindUpaymentsTrackIdWithPredicate(
  node: unknown,
  depth: number,
  accept: (s: string, key: string) => boolean,
): string | undefined {
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
  const o = node as Record<string, unknown>;
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
    for (const k of ['id', 'Id', 'ID'] as const) {
      if (!(k in o)) {
        continue;
      }
      const s = coerceStringishTrackValue(o[k]);
      // Match legacy `isPlausibleTrackValue(s, 'id')` regardless of property casing.
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

function deepFindUpaymentsTrackId(node: unknown, depth: number): string | undefined {
  return deepFindUpaymentsTrackIdWithPredicate(node, depth, (s, k) =>
    isPlausibleTrackValue(s, k),
  );
}

/** Like `deepFindUpaymentsTrackId` but only values safe for `get-payment-status` / `posGatewayTrackId`. */
function deepFindValidUpaymentsChargeInquiryId(
  node: unknown,
  depth: number,
): string | undefined {
  return deepFindUpaymentsTrackIdWithPredicate(node, depth, (s) =>
    isSafeUpaymentsChargeInquiryCandidate(s),
  );
}

/**
 * Keep this aligned with UPayments partner gateways (Apiv2, uInterface, KPay).
 * Real observed production shape (Apr 2026): `data.link` is the ONLY field,
 * and the id sits in the URL as `session_id`.
 */
const TRACK_URL_QUERY_KEYS: readonly string[] = [
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

const TRACK_URL_QUERY_KEYS_LOWER = new Set(
  TRACK_URL_QUERY_KEYS.map((k) => k.toLowerCase()),
);

function pickTrackIdFromUrlSearchParams(sp: URLSearchParams): string | undefined {
  for (const [k, v] of sp.entries()) {
    if (TRACK_URL_QUERY_KEYS_LOWER.has(k.toLowerCase()) && v?.trim()) {
      return v.trim();
    }
  }
  return undefined;
}

function tryParseTrackIdFromPaymentUrl(link: string): string | undefined {
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
    // Hash routing: `https://host/#/pay?session_id=…` — `URL.searchParams` ignores the hash.
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
      const loose = new RegExp(
        `(?:^|[?&#/])(?:${TRACK_URL_QUERY_KEYS.join('|')})=([^&#]+)`,
        'i',
      ).exec(inner);
      if (loose?.[1]) {
        try {
          return decodeURIComponent(loose[1].trim());
        } catch {
          return loose[1].trim();
        }
      }
    }
  } catch {
    // relative or non-standard URL; fall through to regex
  }
  const m = new RegExp(
    `[?&#/](?:${TRACK_URL_QUERY_KEYS.join('|')})=([^&]+)`,
    'i',
  ).exec(normalized);
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
  // Prefer the id embedded in `data.link` (often `session_id=` / `trans_id=`)
  // before JSON object fields — some payloads expose misleading long numeric
  // fields that are not valid `get-payment-status` inquiry ids.
  let t = tryParseTrackIdFromPaymentUrl(paymentUrl);
  if (t && isSafeUpaymentsChargeInquiryCandidate(t)) {
    return t;
  }
  t = tryParseTrackIdFromRecord(data);
  if (t && isSafeUpaymentsChargeInquiryCandidate(t)) {
    return t;
  }
  if (data && typeof data === 'object' && 'data' in (data as object)) {
    t = tryParseTrackIdFromRecord(
      (data as { data?: unknown }).data,
    );
    if (t && isSafeUpaymentsChargeInquiryCandidate(t)) {
      return t;
    }
  }
  t = deepFindValidUpaymentsChargeInquiryId(data, 0);
  return t;
}

/**
 * If `JSON.parse` coerced or skipped fields, re-read `data.link` (or similar)
 * from the raw `/charge` body and parse query / hash / path for an inquiry id.
 */
function extractTrackIdFromChargeLinkEmbeddedInRaw(raw: string): string | undefined {
  const m =
    /"link"\s*:\s*"((?:[^"\\]|\\.)*)"/i.exec(raw) ??
    /"paymentUrl"\s*:\s*"((?:[^"\\]|\\.)*)"/i.exec(raw) ??
    /"paymentLink"\s*:\s*"((?:[^"\\]|\\.)*)"/i.exec(raw) ??
    /"url"\s*:\s*"((?:[^"\\]|\\.)*)"/i.exec(raw);
  if (!m?.[1]) {
    return undefined;
  }
  let linkStr: string;
  try {
    linkStr = JSON.parse(`"${m[1]}"`) as string;
  } catch {
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

/**
 * Last-resort: parse `track_id` / `payment_id` from raw body so 15+ digit ids
 * are not corrupted by JSON number parsing (`Number` precision loss).
 */
function extractTrackIdFromChargeRawJsonText(raw: string): string | undefined {
  const quotedPatterns: RegExp[] = [
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
    if (
      s &&
      !s.startsWith('http') &&
      !looksLikeOurOrderUuid(s) &&
      isPlausibleTrackValue(s, 'raw') &&
      isSafeUpaymentsChargeInquiryCandidate(s)
    ) {
      return s;
    }
  }
  const numM =
    /"(?:trans_?id|tran_?id|track_?id|session_?id|payment_?id|invoice_?id)"\s*:\s*(\d{10,28})\b/.exec(
      raw,
    );
  if (numM?.[1] && isSafeUpaymentsChargeInquiryCandidate(numM[1])) {
    return numM[1];
  }
  return undefined;
}

function pickHttpUrlFromUnknown(v: unknown): string | undefined {
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

/** Payment landing URL: UPayments and partners vary between `link`, `url`, `paymentUrl`. */
function resolveUpaymentsChargePaymentUrl(data: unknown): string | undefined {
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
  const d = data as Record<string, unknown>;
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

/** Some tenants return `{ data: { link } }`, others `{ result: { data: … } }` or `data` as URL string. */
function resolveUpaymentsChargePaymentUrlFromRoot(
  json: Record<string, unknown>,
): string | undefined {
  const fromData = resolveUpaymentsChargePaymentUrl(json.data);
  if (fromData) {
    return fromData;
  }
  const res = json.result;
  if (res && typeof res === 'object' && !Array.isArray(res)) {
    const r = res as Record<string, unknown>;
    const nested =
      resolveUpaymentsChargePaymentUrl(r.data) ??
      resolveUpaymentsChargePaymentUrl(r);
    if (nested) {
      return nested;
    }
  }
  return resolveUpaymentsChargePaymentUrl(json);
}

/**
 * Scan raw `/charge` JSON for payment-looking URLs and parse track-like query keys.
 * Handles ids only appearing inside string-escaped links or alternate hosts.
 */
function extractTrackIdFromHttpsUrlsInChargeRaw(raw: string): string | undefined {
  const re = /https?:\/\/[^\s"']{8,2048}/gi;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(raw)) !== null && n++ < 48) {
    const candidate = m[0].replace(/[,;.)}\]]+$/g, '');
    if (
      !/(upayment|upayments|checkout|payment|pay\.|kpay|knet|u\.kw|safari)/i.test(
        candidate,
      )
    ) {
      continue;
    }
    const tid = tryParseTrackIdFromPaymentUrl(candidate);
    if (tid && isSafeUpaymentsChargeInquiryCandidate(tid)) {
      return tid;
    }
  }
  return undefined;
}

@Injectable()
export class PaymentsService implements OnModuleInit {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly activePollingTransIds = new Set<string>();
  private totalPaymentsProcessed = 0;
  private totalFailures = 0;
  private totalDuplicates = 0;
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
    private readonly whatsappQueue: WhatsAppQueueService,
    private readonly discordAlerts: DiscordAlertService,
    private readonly auditLogs: AuditLogsService,
    @Optional() private readonly metrics?: MetricsService,
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

  /**
   * يتحقق عند التشغيل من إعدادات بوابة الدفع والروابط العامة اللازمة لتحصيل الأموال.
   * Validates payment-gateway and public callback configuration at startup for money collection flows.
   * @returns لا تُرجع قيمة / No return value
   */
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

  /**
   * يسمح بنداء callback تجريبي فقط في وضع بوابة الدفع الوهمية للتطوير.
   * Allows a development mock callback only when the mock payment gateway is enabled.
   * @param body - جسم الطلب الذي قد يحتوي devMock / Request body that may include devMock
   * @returns هل يسمح بالـ callback التجريبي / Whether the mock callback is allowed
   */
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
    const url = resolveUpaymentsChargePaymentUrlFromRoot(json as Record<string, unknown>);
    if (!url) {
      throw new BadRequestException(
        'UPayments response missing payment link (`data.link` / `data.url` / similar)',
      );
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

    // V1.7.1 — Gateways like KNET hosted (`trandata=…`) never expose a
    // track id in /charge; the real id only arrives in the return URL /
    // webhook after the customer pays. Do NOT block the POS — return the
    // payment URL without a track id; the webhook will persist
    // `posGatewayTrackId` when it fires with the real `trans_id`.
    const validatedTrackId = trackId
      ? this.tryValidateChargePaymentStatusId(trackId, text, params.orderId)
      : undefined;

    if (!validatedTrackId) {
      const dataKeys =
        dataBlock && typeof dataBlock === 'object' && !Array.isArray(dataBlock)
          ? Object.keys(dataBlock as object).join(',')
          : typeof dataBlock === 'string'
            ? '(string)'
            : Array.isArray(dataBlock)
              ? '(array)'
              : 'n/a';
      this.logger.warn(
        `UPayments /charge: no inquiry id in response (order=${params.orderId}). data keys=[${dataKeys}]. Link returned; webhook will provide trans_id/track_id. Raw=${text.slice(0, 800)}`,
      );
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

  /**
   * V1.7.1 — Validate-or-drop variant. Returns `undefined` when the /charge
   * response contains an id that is too long / malformed, so the POS link
   * creation does not fail: the real id will be filled in by the webhook.
   * `/api/v1/get-payment-status/{id}` is only called with ids that pass
   * `isValidUpaymentsPaymentStatusInquiryId`.
   */
  private tryValidateChargePaymentStatusId(
    primary: string,
    rawJsonText: string,
    orderIdForLog: string,
  ): string | undefined {
    const t = primary.trim();
    if (isValidUpaymentsPaymentStatusInquiryId(t)) {
      return t;
    }
    this.logger.warn(
      `UPayments /charge: resolved inquiry id rejected (len=${t.length}) order=${orderIdForLog.slice(0, 8)}… — attempting recovery from raw JSON`,
    );
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
    this.logger.warn(
      `UPayments /charge: inquiry id unrecoverable order=${orderIdForLog} badLen=${t.length} — will rely on webhook trans_id`,
    );
    return undefined;
  }

  /**
   * V1.7.0 — Server-to-Server inquiry. Called from the webhook
   * handler so we never trust the webhook body blindly; the
   * authoritative payment state is whatever UPayments reports for
   * this **payment-status id** (dashboard `trans_id` / webhook `tran_id` /
   * docs `track_id`) via its own authenticated endpoint.
   *
   * Docs: `GET /api/v1/get-payment-status/{track_id}` (UInterfaceV2).
   */
  async fetchGatewayStatus(
    /** Inquiry id: prefer merchant `trans_id` / `tran_id` when supplied; same URL segment as `track_id` in docs. */
    trackId: string,
  ): Promise<{ ok: boolean; data: UPaymentsInquiryData; raw: unknown }> {
    const clean = trackId.trim();
    if (!clean) {
      return { ok: false, data: {}, raw: null };
    }
    if (!isValidUpaymentsPaymentStatusInquiryId(clean)) {
      this.logger.warn(
        `UPayments inquiry skipped: invalid inquiry id (len=${clean.length}) prefix=${clean.slice(0, 20)}…`,
      );
      return {
        ok: false,
        data: {},
        raw: { invalidInquiryId: clean.slice(0, 80) },
      };
    }
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
    const statusUrl = `${this.apiBase}/api/v1/get-payment-status/${encodeURIComponent(clean)}`;
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
        `UPayments inquiry failed for ${clean}: ${json.message ?? text.slice(0, 200)}`,
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
  /**
   * V25 Controller Math Purge — expose KWD→minor comparison as a service
   * method so controllers never hold financial parsing logic themselves.
   *
   * Returns `'match'` when both amounts resolve to the same minor-unit
   * integer (fils), `'mismatch'` when they differ, or `'indeterminate'`
   * when either amount is missing / unparseable. The controller uses the
   * returned discriminant to decide whether to block finalization without
   * duplicating `parseKwdMinor` or `Math.round` logic.
   */
  compareGatewayAmount(
    gatewayRaw: string | number | undefined | null,
    orderTotal: string | number,
  ): 'match' | 'mismatch' | 'indeterminate' {
    const gatewayMinor = parseKwdMinor(gatewayRaw);
    const orderMinor = parseKwdMinor(orderTotal);
    if (gatewayMinor === null) return 'indeterminate';
    if (orderMinor === null) return 'indeterminate';
    return gatewayMinor === orderMinor ? 'match' : 'mismatch';
  }

  /**
   * يطبع حالة بوابة الدفع إلى نجاح أو فشل قبل أي أثر مالي على الطلب أو المحفظة.
   * Normalizes gateway callback status to success or failed before any order, wallet, or ledger effect.
   * @param status - الحالة الخام القادمة من البوابة / Raw gateway status
   * @returns الحالة الموحدة للمعالجة / Normalized processing status
   */
  normalizeCallbackStatus(status: string): 'success' | 'failed' {
    const raw = (status ?? '').trim();
    if (!raw) {
      return 'failed';
    }
    const s = raw.toLowerCase();
    const firstSegment = (s.split(/[,;|]/)[0] ?? s).trim();
    const head = (firstSegment.split(/\s+/)[0] ?? firstSegment).trim();
    if (
      head === 'success' ||
      head === 'paid' ||
      head === 'completed' ||
      head === 'captured' ||
      head === 'authorized' ||
      head === 'capture'
    ) {
      return 'success';
    }
    if (/\bcaptured\b/.test(s) && !/\b(not|un|de|pre)\s*captured\b/.test(s)) {
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
    return this.checkPaymentStatus(clean, orderId, source);
  }

  /**
   * Browser return/webhook body is only a hint. Never trust its result/amount;
   * always ask UPayments server-to-server and finalize from that response.
   */
  async tryFinalizeOrderFromTrustedUpaymentsReturn(
    orderId: string,
    trackId: string,
    _gatewayResultRaw: string,
    source: string,
    _extras?: {
      paymentId?: string | null;
      tranId?: string | null;
      amount?: string;
    },
  ): Promise<{ finalized: boolean }> {
    const clean = trackId.trim();
    if (!clean) {
      return { finalized: false };
    }
    const r = await this.checkPaymentStatus(clean, orderId, source);
    return { finalized: r.finalized };
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
    chargeAmountKd?: string | Prisma.Decimal,
  ): Promise<CreatePaymentLinkResult> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        cashStatus: true,
        posPaymentMethod: true,
        totalPrice: true,
        walletSettledAt: true,
        posHostedPaymentUrl: true,
        posGatewayTrackId: true,
        posGatewayMetadata: true,
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

    const tolerance = new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD);
    let chargeAmount = chargeAmountKd
      ? new Prisma.Decimal(chargeAmountKd.toString())
      : null;
    if (!chargeAmount || !chargeAmount.isFinite()) {
      const remainingByOrder = await computeOrderRemainingBalancesBatch(
        this.prisma,
        [orderId],
      );
      chargeAmount = remainingByOrder.get(orderId) ?? new Prisma.Decimal(0);
      if (
        chargeAmount.lessThanOrEqualTo(tolerance) &&
        order.status === OrderStatus.PENDING &&
        order.cashStatus === CashStatus.UNPAID &&
        !order.walletSettledAt
      ) {
        chargeAmount = order.totalPrice;
      }
    }
    if (chargeAmount.lessThanOrEqualTo(tolerance)) {
      throw new BadRequestException('Order is already paid');
    }

    const storedChargeKd = this.readStoredPaymentLinkChargeKd(
      order.posGatewayMetadata,
    );
    if (
      order.posHostedPaymentUrl &&
      order.posGatewayTrackId &&
      storedChargeKd &&
      this.paymentLinkChargeMatches(storedChargeKd, chargeAmount, tolerance)
    ) {
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
      amount: chargeAmount,
      customerPhone: phone,
      customerName: order.customer.displayName ?? undefined,
      customerUniqueId: order.customer.id.slice(0, 20),
    });
    const tid = link.trackId ?? null;
    const existingMeta =
      order.posGatewayMetadata &&
      typeof order.posGatewayMetadata === 'object' &&
      !Array.isArray(order.posGatewayMetadata)
        ? (order.posGatewayMetadata as Record<string, unknown>)
        : {};
    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        posHostedPaymentUrl: link.url,
        posGatewayTrackId: tid,
        posGatewayMetadata: {
          ...existingMeta,
          charge: {
            provider: 'upayments',
            trackId: tid,
            link: link.url,
            amountKd: chargeAmount.toFixed(4),
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

  private readStoredPaymentLinkChargeKd(
    metadata: Prisma.JsonValue | null,
  ): Prisma.Decimal | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return null;
    }
    const charge = (metadata as Record<string, unknown>).charge;
    if (!charge || typeof charge !== 'object' || Array.isArray(charge)) {
      return null;
    }
    const raw = (charge as Record<string, unknown>).amountKd;
    try {
      if (typeof raw === 'string' && raw.trim()) {
        return new Prisma.Decimal(raw);
      }
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        return new Prisma.Decimal(raw);
      }
    } catch {
      return null;
    }
    return null;
  }

  private paymentLinkChargeMatches(
    stored: Prisma.Decimal,
    current: Prisma.Decimal,
    tolerance: Prisma.Decimal,
  ): boolean {
    return stored.sub(current).abs().lessThanOrEqualTo(tolerance);
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

  private paymentLog(
    event: string,
    data: {
      transId?: string | null;
      orderId?: string | null;
      status?: string;
      [key: string]: unknown;
    },
  ): void {
    this.logger.log(
      JSON.stringify({
        event,
        transId: data.transId ?? null,
        orderId: data.orderId ?? null,
        status: data.status ?? 'info',
        timestamp: new Date().toISOString(),
        totalPaymentsProcessed: this.totalPaymentsProcessed,
        totalFailures: this.totalFailures,
        totalDuplicates: this.totalDuplicates,
        ...data,
      }),
    );
  }

  private paymentError(
    event: string,
    data: {
      transId?: string | null;
      orderId?: string | null;
      status?: string;
      [key: string]: unknown;
    },
  ): void {
    this.logger.error(
      JSON.stringify({
        event,
        transId: data.transId ?? null,
        orderId: data.orderId ?? null,
        status: data.status ?? 'error',
        timestamp: new Date().toISOString(),
        totalPaymentsProcessed: this.totalPaymentsProcessed,
        totalFailures: this.totalFailures,
        totalDuplicates: this.totalDuplicates,
        ...data,
      }),
    );
  }

  private async runPostPaymentSelfCheck(orderId: string): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          transactionHistory: true,
        },
      });

      if (!order) return;

      const issues: string[] = [];

      if (order.status !== OrderStatus.COMPLETED) {
        issues.push('order_not_completed');
      }
      if (!order.walletSettledAt) {
        issues.push('wallet_not_settled');
      }
      if (!order.transactionHistory || order.transactionHistory.length === 0) {
        issues.push('missing_transaction_history');
      }

      if (issues.length > 0) {
        this.discordAlerts.enqueue('payment_inconsistency', {
          orderId,
          issues,
          version: APP_VERSION,
        });
      }
    } catch (err) {
      this.logger.error(
        `post_payment_self_check_failed ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * يستعلم عن حالة الدفع من البوابة ويكمل التحصيل عند النجاح، بما يشمل إغلاق الطلب وتسوية المحفظة وقيود الدفتر.
   * Inquires gateway payment status and finalizes successful captures, including order completion, wallet settlement, and ledger effects.
   * @param transId - معرف الاستعلام لدى بوابة الدفع / Gateway inquiry transaction id
   * @param expectedOrderId - معرف الطلب المتوقع اختيارياً / Optional expected order id
   * @param source - مصدر محاولة التحقق أو polling / Verification or polling source label
   * @returns نتيجة الإكمال وحالة البوابة والرد الخام / Finalization result, gateway status, and raw inquiry payload
   */
  async checkPaymentStatus(
    transId: string,
    expectedOrderId?: string,
    source = 'POLLING',
  ): Promise<{
    finalized: boolean;
    gatewayResult: string | null;
    inquiryRaw: unknown;
  }> {
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

    const inquiryOrderId =
      inquiry.data.order?.id?.trim() ||
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
      this.logger.warn(
        `finalize_rejected order_mismatch expected=${expectedOrderId} actual=${referenceId} transId=${clean.slice(0, 16)}`,
      );
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
    const forceCapturedFinalize = gatewayResult === 'CAPTURED';
    const stored = reference.trackId?.trim() ?? '';
    if (!forceCapturedFinalize && stored && stored !== clean) {
      this.totalFailures += 1;
      this.paymentLog('finalize_rejected', {
        transId: clean,
        orderId: reference.id,
        status: 'trans_mismatch',
      });
      this.logger.warn(
        `finalize_rejected trans_mismatch orderId=${reference.id} stored=${stored.slice(0, 16)} incoming=${clean.slice(0, 16)}`,
      );
      return { finalized: false, gatewayResult, inquiryRaw: inquiry.raw };
    }
    const gatewayAmountMinor = parseKwdMinor(inquiry.data.amount);
    const expectedAmountMinor = parseKwdMinor(reference.amount.toString());
    if (
      !forceCapturedFinalize &&
      (gatewayAmountMinor === null || gatewayAmountMinor !== expectedAmountMinor)
    ) {
      this.totalFailures += 1;
      this.paymentError('finalize_rejected', {
        transId: clean,
        orderId: reference.id,
        status: 'amount_mismatch',
        expectedAmountMinor,
        gatewayAmountMinor,
      });
      this.logger.warn(
        `finalize_rejected amount_mismatch orderId=${reference.id} expectedMinor=${expectedAmountMinor} gatewayMinor=${gatewayAmountMinor}`,
      );
      return { finalized: false, gatewayResult, inquiryRaw: inquiry.raw };
    }
    const currency = inquiry.data.currency?.trim().toUpperCase();
    if (!forceCapturedFinalize && currency && currency !== 'KWD') {
      this.totalFailures += 1;
      this.paymentLog('finalize_rejected', {
        transId: clean,
        orderId: reference.id,
        status: 'currency_mismatch',
        currency,
      });
      this.logger.warn(
        `finalize_rejected currency_mismatch orderId=${reference.id} currency=${currency}`,
      );
      return { finalized: false, gatewayResult, inquiryRaw: inquiry.raw };
    }

    this.logger.log(
      `about_to_finalize orderId=${reference.id} source=${source} trackId=${clean} version=${APP_VERSION}`,
    );
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
    } as never);
    if (forceCapturedFinalize && !finalized) {
      this.logger.error(
        `CRITICAL captured_payment_not_finalized orderId=${reference.id} result=${gatewayResult} trackId=${clean} version=${APP_VERSION}`,
      );
    }
    return { finalized, gatewayResult, inquiryRaw: inquiry.raw };
  }

  private startGatewayStatusPolling(orderId: string, transId: string): void {
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
          const result = await this.checkPaymentStatus(
            transId,
            orderId,
            `POLLING_ATTEMPT_${attempt}`,
          );
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
            this.logger.log(
              `polling_retry orderId=${orderId} attempt=${attempt} gatewayResult=${result.gatewayResult ?? 'n/a'}`,
            );
          }
        }
        this.totalFailures += 1;
        this.paymentError('polling_failed', {
          transId: pollingKey,
          orderId,
          status: 'max_retries_exhausted',
        });
        this.logger.warn(`polling_failed orderId=${orderId} transId=${transId.slice(0, 16)}`);
      } finally {
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

  private async isGatewayReferencePaid(referenceId: string): Promise<boolean> {
    const order = await this.prisma.order.findUnique({
      where: { id: referenceId },
      select: { status: true, walletSettledAt: true },
    });
    if (order) {
      return order.status === OrderStatus.COMPLETED || Boolean(order.walletSettledAt);
    }
    const bundle = await this.prisma.posPaymentBundle.findUnique({
      where: { id: referenceId },
      select: {
        orders: {
          select: { status: true, walletSettledAt: true },
        },
      },
    });
    return Boolean(
      bundle?.orders.length &&
        bundle.orders.every(
          (o) => o.status === OrderStatus.COMPLETED || Boolean(o.walletSettledAt),
        ),
    );
  }

  private async getGatewayReferenceForFinalize(referenceId: string): Promise<{
    id: string;
    amount: Prisma.Decimal;
    trackId: string | null;
    isPaid: boolean;
  } | null> {
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
        isPaid: order.status === OrderStatus.COMPLETED || Boolean(order.walletSettledAt),
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
      isPaid:
        bundle.orders.length > 0 &&
        bundle.orders.every(
          (o) => o.status === OrderStatus.COMPLETED || Boolean(o.walletSettledAt),
        ),
    };
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
  ): Promise<boolean> {
    const finalizeStarted = performance.now();
    this.logger.log(`finalize_started orderId=${referenceId} version=${APP_VERSION}`);
    try {
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
        let didFinalizeAny = false;
        for (const o of bundle.orders) {
          didFinalizeAny =
            (await this.finalizeSinglePaidOrderFromGateway(o.id, gatewayMetadata)) ||
            didFinalizeAny;
        }
        this.metrics?.recordFinalize(performance.now() - finalizeStarted, didFinalizeAny);
        return didFinalizeAny;
      }

      const didFinalize = await this.finalizeSinglePaidOrderFromGateway(
        referenceId,
        gatewayMetadata,
      );
      this.metrics?.recordFinalize(performance.now() - finalizeStarted, didFinalize);
      return didFinalize;
    } catch (error) {
      this.metrics?.recordFinalize(performance.now() - finalizeStarted, false);
      throw error;
    }
  }

  private async finalizeSinglePaidOrderFromGateway(
    orderId: string,
    gatewayMetadata?: Prisma.InputJsonValue,
  ): Promise<boolean> {
    this.logger.log(`finalize_started orderId=${orderId} version=${APP_VERSION}`);
    const alertTrackId = extractTrackIdFromFinalizeGatewayMetadata(gatewayMetadata);
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
            posPaymentBundleId: true,
            posGatewayTrackId: true,
            posGatewayMetadata: true,
          },
        });
        if (!order) {
          throw new BadRequestException('Order not found');
        }
        if (order.walletSettledAt || order.status === OrderStatus.COMPLETED) {
          this.totalDuplicates += 1;
          this.paymentLog('duplicate_noop', {
            transId: order.posGatewayTrackId,
            orderId: order.id,
            status: 'already_paid',
          });
          this.logger.log(`ignored_duplicate_capture orderId=${order.id}`);
          return false;
        }
        if (order.status === OrderStatus.CANCELED) {
          throw new BadRequestException(
            'Order is canceled — cannot finalize a link payment for it',
          );
        }

        const completedAt = new Date();
        const mergedGatewayMetadata = mergeGatewayMetadata(
          order.posGatewayMetadata,
          gatewayMetadata,
          completedAt,
        );
        const inquiryCapableTrackId =
          extractTrackIdFromFinalizeGatewayMetadata(gatewayMetadata);
        const bundleAmount = order.posPaymentBundleId
          ? await tx.posPaymentBundle.findUnique({
              where: { id: order.posPaymentBundleId },
              select: { totalAmountKd: true },
            })
          : null;
        const forceCapturedFinalize = isCapturedFinalizeMetadata(gatewayMetadata);
        /**
         * 🔒 DO NOT MODIFY - PAYMENT FINALIZATION GUARANTEE
         *
         * Alerts MUST NEVER interfere with payment flow.
         */
        // DO NOT MODIFY - PAYMENT FINALIZATION GUARANTEE
        // Once UPayments reports CAPTURED for a non-completed order, finalization
        // must reach the atomic updateMany claim below; no optional guard may skip it.
        const gatewayChecks = validateFinalizeGatewayMetadata(
          gatewayMetadata,
          bundleAmount?.totalAmountKd ?? order.totalPrice,
          order.posGatewayTrackId,
          inquiryCapableTrackId,
        );
        if (!gatewayChecks.ok && !forceCapturedFinalize) {
          this.totalFailures += 1;
          this.paymentLog('finalize_rejected', {
            transId: inquiryCapableTrackId ?? order.posGatewayTrackId,
            orderId: order.id,
            status: gatewayChecks.reason,
          });
          this.logger.warn(
            `finalize_rejected ${gatewayChecks.reason} orderId=${order.id}`,
          );
          return false;
        }
        const claim = await tx.order.updateMany({
          where: {
            id: orderId,
            walletSettledAt: null,
            status: { not: OrderStatus.COMPLETED },
          },
          data: {
            status: OrderStatus.COMPLETED,
            // V19.11.3 — hosted link is settled by the gateway; the
            // driver never touches the money, so don't mark it as cash.
            cashStatus: cashStatusForPaymentMethod(PosPaymentMethod.ONLINE),
            completedAt,
            posPaymentMethod: PosPaymentMethod.ONLINE,
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
        this.logger.log(
          `finalize_claim_result orderId=${order.id} count=${claim.count} version=${APP_VERSION}`,
        );
        if (claim.count === 0) {
          this.totalDuplicates += 1;
          this.paymentLog('duplicate_noop', {
            transId: inquiryCapableTrackId ?? order.posGatewayTrackId,
            orderId: order.id,
            status: 'claim_lost',
          });
          this.logger.log(`ignored_duplicate_capture orderId=${order.id}`);
          if (forceCapturedFinalize) {
            this.discordAlerts.enqueue('captured_payment_not_finalized', {
              orderId: order.id,
              trackId: inquiryCapableTrackId ?? order.posGatewayTrackId,
              version: APP_VERSION,
              result: 'CAPTURED',
              reason: 'claim_lost',
            });
            this.logger.error(
              `CRITICAL captured_payment_not_finalized orderId=${order.id} result=CAPTURED reason=claim_lost version=${APP_VERSION}`,
            );
          }
          return false;
        }
        this.logger.log(`first_successful_capture orderId=${order.id}`);
        this.logger.log(
          `payment_invoice_updated orderId=${order.id} status=${OrderStatus.COMPLETED} paymentMethod=${PosPaymentMethod.ONLINE}`,
        );

        // V1.6.2 — every gateway-finalized order reached this point by
        // definition from the UNPAID bucket. That means EVERY row we write
        // here counts as "debt collected today".
        const originalMethod = order.posPaymentMethod;

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
          gatewayConfirmedAmountKd: order.totalPrice.toString(),
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
        await this.customerLedger.applyOrderWalletSettlementForCompletedOrder(
          tx,
          orderId,
          performerId,
          prefetch,
          extraMetadata,
        );
        const walletAfterSettlement = await tx.customerWallet.findUnique({
          where: { customerId: order.customerId },
          select: { debt: true },
        });
        this.logger.log(
          `payment_wallet_updated orderId=${order.id} customerId=${order.customerId} debtBefore=${walletBeforeSettlement?.debt.toString() ?? '0'} debtAfter=${walletAfterSettlement?.debt.toString() ?? '0'} version=${APP_VERSION}`,
        );
        this.logger.log(
          `payment_financial_transaction_recorded orderId=${order.id} customerId=${order.customerId} amount=${order.totalPrice.toString()} trackId=${inquiryCapableTrackId ?? order.posGatewayTrackId ?? 'n/a'} version=${APP_VERSION}`,
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
        this.totalPaymentsProcessed += 1;
        this.paymentLog('finalize_success', {
          transId: inquiryCapableTrackId ?? order.posGatewayTrackId,
          orderId: order.id,
          status: 'completed',
        });
        this.discordAlerts.enqueue('finalize_success', {
          orderId: order.id,
          trackId: inquiryCapableTrackId ?? order.posGatewayTrackId,
          version: APP_VERSION,
          status: 'completed',
        });
        return true;
      },
      { maxWait: 10_000, timeout: 15_000 },
    ).catch((error: unknown) => {
      this.discordAlerts.enqueue('finalize_failed', {
        orderId,
        trackId: alertTrackId,
        version: APP_VERSION,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    });
    if (didFinalize) {
      void this.runPostPaymentSelfCheck(orderId);
      this.emitPaymentConfirmedNotify(orderId);
    }
    return didFinalize;
  }

  private static readonly GATEWAY_ORDER_FRESH_MS = 72 * 3600 * 1000;

  private inferPaymentScenarioFromOrderAge(createdAt: Date): PaymentConfirmedCustomerScenario {
    return Date.now() - createdAt.getTime() <=
      PaymentsService.GATEWAY_ORDER_FRESH_MS
      ? 'new_pos_order'
      : 'debt_receipt';
  }

  /**
   * After the order is fully paid (any channel: gateway, CC mark-paid, or
   * POS instant settlement), schedule the same customer WhatsApp as the
   * link callback (thank-you + optional `/r/:orderId` rating URL).
   */
  schedulePaymentConfirmedCustomerNotify(
    orderId: string,
    scenario?: PaymentConfirmedCustomerScenario,
  ): void {
    this.emitPaymentConfirmedNotify(orderId, scenario);
  }

  /**
   * WhatsApp: payment-thanks + public `/r/:orderId` rating link (when
   * `PUBLIC_WEB_APP_URL` is set). Phone resolution matches invoice notify
   * (Kuwait mobile preferred, else first non-empty on file).
   */
  private emitPaymentConfirmedNotify(
    orderId: string,
    scenario?: PaymentConfirmedCustomerScenario,
  ): void {
    /**
     * 🔒 DO NOT MODIFY - PAYMENT FINALIZATION GUARANTEE
     *
     * Alerts and customer notifications MUST NEVER interfere with payment flow.
     */
    this.whatsappQueue.enqueuePaymentConfirmed(orderId, scenario);
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
   * Idempotent: if `walletSettledAt` is set **and** this is **not**
   * a DEBT_ON_ACCOUNT invoice still awaiting physical cash collection,
   * we return `{ alreadySettled: true }`. Debt-on-account sales set
   * `walletSettledAt` when POS books the receivable — the second-phase
   * «تم الدفع» path delegates to {@link CustomerLedgerService.recordDebtInvoiceCollectedAtCallCenter}.
   * Canceled orders are rejected.
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
        const awaitingDebtPhysicalCollection =
          Boolean(order.walletSettledAt) &&
          order.posPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT;

        if (order.walletSettledAt && !awaitingDebtPhysicalCollection) {
          return {
            orderId: order.id,
            alreadySettled: true,
            amountKd: order.totalPrice.toFixed(3),
            posPaymentMethod:
              order.posPaymentMethod ?? PosPaymentMethod.CASH,
            customerId: order.customerId,
            auditAction: 'PAYMENT_MADE' as const,
          };
        }

        // V1.7.6 — «على الحساب»: wallet line already booked at POS; this
        // button records cash/KNET at the CC desk without duplicating POS
        // revenue/stock/debit (see Bug: toast «مسددة مسبقاً» on debt rows).
        if (awaitingDebtPhysicalCollection) {
          const performerId =
            performedByUserId ??
            order.driverId ??
            (await this.resolveFallbackPerformer(tx));
          if (!performerId) {
            throw new BadRequestException(
              'No performer available to attribute the manual settlement to',
            );
          }
          const out =
            await this.customerLedger.recordDebtInvoiceCollectedAtCallCenter(
              tx,
              {
                orderId,
                confirmedMethod: method,
                performedByUserId: performerId,
              },
            );

          return {
            orderId: order.id,
            // Always false here so CC sees a successful toast after the flip/
            // pay-down (`already_cleared` = FIFO retired the debt elsewhere but
            // we still sync posPaymentMethod to the handset). A true duplicate
            // press after the invoice is genuinely CASH is handled by the
            // universal `walletSettledAt && !DEBT`-guard above.
            alreadySettled: false,
            amountKd: order.totalPrice.toFixed(3),
            posPaymentMethod: method,
            customerId: order.customerId,
            auditAction: 'DEBT_PAYMENT' as const,
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
            ccCollectionPaymentWaLocked: false,
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
          customerId: order.customerId,
          auditAction: 'PAYMENT_MADE' as const,
        };
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
    if (!result.alreadySettled) {
      this.auditLogs.logFinancialEvent({
        action: result.auditAction,
        customerId: result.customerId,
        orderId: result.orderId,
        amount: result.amountKd,
        source: result.posPaymentMethod,
        userId: performedByUserId,
      });
      this.emitPaymentConfirmedNotify(orderId, 'debt_receipt');
      // V20.3.2 — Phase 5 post-commit consistency log. Manual
      // mark-paid is a `PAYMENT` event when CASH/KNET reduces a
      // standard invoice and a `DEBT_COLLECTION` event when the
      // call-center desk physically collects on a previously
      // booked DEBT_ON_ACCOUNT row. The audit-action enum already
      // distinguishes these two, so we mirror it here.
      this.customerLedger.postWriteUiConsistencyAssert(
        result.customerId,
        {
          source:
            result.auditAction === 'DEBT_PAYMENT'
              ? 'DEBT_COLLECTION'
              : 'PAYMENT',
          correlationId: result.orderId,
        },
      );
      // V20.4 — Phase 5 typed event so the snapshot projection
      // refreshes immediately. The listener catches up the read
      // side without the cron 5-minute lag.
      this.customerLedger.emitFinancialEvent('finance.payment.captured', {
        customerId: result.customerId,
        orderId: result.orderId,
        correlationId: result.orderId,
        occurredAt: new Date().toISOString(),
        amountKd: result.amountKd,
        paymentMethod: result.posPaymentMethod,
      });
    }
    return {
      orderId: result.orderId,
      alreadySettled: result.alreadySettled,
      amountKd: result.amountKd,
      posPaymentMethod: result.posPaymentMethod,
    };
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseKwdMinor(raw: string | number | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 1000);
}

function validateFinalizeGatewayMetadata(
  meta: Prisma.InputJsonValue | undefined,
  orderTotal: Prisma.Decimal,
  storedTrackId: string | null,
  incomingTrackId: string | undefined,
): { ok: true } | { ok: false; reason: string } {
  if (meta == null || typeof meta !== 'object' || Array.isArray(meta)) {
    return { ok: true };
  }
  const m = meta as Record<string, unknown>;
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
  const gatewayAmountMinor = parseKwdMinor(
    typeof m.amount === 'string' || typeof m.amount === 'number'
      ? m.amount
      : undefined,
  );
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

function isCapturedFinalizeMetadata(meta: Prisma.InputJsonValue | undefined): boolean {
  if (meta == null || typeof meta !== 'object' || Array.isArray(meta)) {
    return false;
  }
  const m = meta as Record<string, unknown>;
  const result = typeof m.result === 'string' ? m.result.trim().toUpperCase() : '';
  return result === 'CAPTURED';
}

function extractTrackIdFromFinalizeGatewayMetadata(
  meta: Prisma.InputJsonValue | undefined,
): string | undefined {
  if (meta == null || typeof meta !== 'object' || Array.isArray(meta)) {
    return undefined;
  }
  const m = meta as Record<string, unknown>;
  const candidates: Array<string | undefined> = [
    tryParseTrackIdFromRecord(m),
  ];
  const callback = m.callback;
  if (callback && typeof callback === 'object' && !Array.isArray(callback)) {
    const payload = (callback as Record<string, unknown>).payload;
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
