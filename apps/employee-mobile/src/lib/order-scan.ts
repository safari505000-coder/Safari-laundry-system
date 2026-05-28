const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pull UUID from customer QR URLs like `/r/:orderId`. */
export function extractScannedOrderReference(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }

  const fromRatingPath = trimmed.match(/\/r\/([0-9a-f-]{36})/i);
  if (fromRatingPath) {
    return normalizeScannedOrderId(fromRatingPath[1]);
  }

  const embeddedUuid = trimmed.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
  if (embeddedUuid) {
    return normalizeScannedOrderId(embeddedUuid[0]);
  }

  return normalizeScannedOrderId(trimmed);
}

/** Normalize scanner / pasted order id (UUID with or without hyphens). */
export function normalizeScannedOrderId(raw: string): string {
  const s = raw.trim();
  const withHyphens = UUID_RE;
  if (withHyphens.test(s)) {
    return s.toLowerCase();
  }
  const compact = s.replace(/[^0-9a-f]/gi, '');
  if (compact.length === 32) {
    return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`.toLowerCase();
  }
  return s;
}

export function isValidOrderId(raw: string | undefined | null): boolean {
  if (!raw?.trim()) {
    return false;
  }
  return UUID_RE.test(normalizeScannedOrderId(raw));
}
