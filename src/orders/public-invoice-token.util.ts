export function normalizePublicInvoiceTokenParam(raw: string): string {
  const t = (raw ?? '').trim();
  if (!t) {
    return t;
  }
  try {
    return decodeURIComponent(t);
  } catch {
    return t;
  }
}
