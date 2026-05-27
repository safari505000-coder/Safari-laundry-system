/** Normalize scanner / pasted order id (UUID with or without hyphens). */
export function normalizeScannedOrderId(raw: string): string {
  const s = raw.trim();
  const withHyphens =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (withHyphens.test(s)) {
    return s.toLowerCase();
  }
  const compact = s.replace(/[^0-9a-f]/gi, '');
  if (compact.length === 32) {
    return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`.toLowerCase();
  }
  return s;
}
