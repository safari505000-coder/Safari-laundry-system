export type UPaymentsInquiryData = {
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

export function looksLikeOurOrderUuid(s: string): boolean {
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

export function isValidUpaymentsPaymentStatusInquiryId(s: string): boolean {
  const t = (s ?? '').trim();
  return isPlausibleTrackValue(t, 'inquiry');
}

export function isSafeUpaymentsChargeInquiryCandidate(s: string): boolean {
  const t = (s ?? '').trim();
  if (!isValidUpaymentsPaymentStatusInquiryId(t)) {
    return false;
  }
  if (looksLikeOurOrderUuid(t)) {
    return false;
  }
  return true;
}

export function tryParseTrackIdFromRecord(o: unknown): string | undefined {
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

export function deepFindUpaymentsTrackId(
  node: unknown,
  depth: number,
): string | undefined {
  return deepFindUpaymentsTrackIdWithPredicate(node, depth, (s, k) =>
    isPlausibleTrackValue(s, k),
  );
}

export function deepFindValidUpaymentsChargeInquiryId(
  node: unknown,
  depth: number,
): string | undefined {
  return deepFindUpaymentsTrackIdWithPredicate(node, depth, (s) =>
    isSafeUpaymentsChargeInquiryCandidate(s),
  );
}

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

function pickTrackIdFromUrlSearchParams(
  sp: URLSearchParams,
): string | undefined {
  for (const [k, v] of sp.entries()) {
    if (TRACK_URL_QUERY_KEYS_LOWER.has(k.toLowerCase()) && v?.trim()) {
      return v.trim();
    }
  }
  return undefined;
}

export function tryParseTrackIdFromPaymentUrl(
  link: string,
): string | undefined {
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

export function extractUpaymentsChargeTrackId(
  data: unknown,
  paymentUrl: string,
): string | undefined {
  let t = tryParseTrackIdFromPaymentUrl(paymentUrl);
  if (t && isSafeUpaymentsChargeInquiryCandidate(t)) {
    return t;
  }
  t = tryParseTrackIdFromRecord(data);
  if (t && isSafeUpaymentsChargeInquiryCandidate(t)) {
    return t;
  }
  if (data && typeof data === 'object' && 'data' in (data as object)) {
    t = tryParseTrackIdFromRecord((data as { data?: unknown }).data);
    if (t && isSafeUpaymentsChargeInquiryCandidate(t)) {
      return t;
    }
  }
  t = deepFindValidUpaymentsChargeInquiryId(data, 0);
  return t;
}

export function extractTrackIdFromChargeLinkEmbeddedInRaw(
  raw: string,
): string | undefined {
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

export function extractTrackIdFromChargeRawJsonText(
  raw: string,
): string | undefined {
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

export function resolveUpaymentsChargePaymentUrl(
  data: unknown,
): string | undefined {
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

export function resolveUpaymentsChargePaymentUrlFromRoot(
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

export function extractTrackIdFromHttpsUrlsInChargeRaw(
  raw: string,
): string | undefined {
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
