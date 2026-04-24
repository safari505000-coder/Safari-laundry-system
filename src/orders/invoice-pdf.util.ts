/**
 * V19.27 — Public API URL for a direct PDF stream (WhatsApp / Moatmt `media_url`).
 * Gateways must fetch binary `application/pdf`; a SPA or JSON link is not enough.
 * Uses the same public host as UPayments callback (`PUBLIC_API_URL` / `PAYMENTS_CALLBACK_PUBLIC_URL`).
 */
export function buildPublicInvoicePdfUrl(token: string): string | undefined {
  const apiBase = (
    process.env.PUBLIC_API_URL?.trim() ||
    process.env.PAYMENTS_CALLBACK_PUBLIC_URL?.trim() ||
    ''
  ).replace(/\/$/, '');
  if (!apiBase) {
    return undefined;
  }
  return `${apiBase}/api/public/invoice/pdf/${encodeURIComponent(token)}`;
}
