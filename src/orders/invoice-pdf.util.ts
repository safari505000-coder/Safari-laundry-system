/**
 * V19.27 — Public API URL for a direct PDF stream (WhatsApp / Moatmt `media_url`).
 * Gateways must fetch binary `application/pdf`; a SPA or JSON link is not enough.
 * Uses the same public host as UPayments callback (`PUBLIC_API_URL` / `PAYMENTS_CALLBACK_PUBLIC_URL`).
 *
 * The `token` argument MUST be the full string returned from `jwt.signAsync` in
 * `mintInvoiceShareLink` (no placeholder). We use `?token=` so the JWT is in the
 * query string — some reverse proxies mangle very long path segments; path form
 * `.../pdf/:token` remains supported in `PublicInvoiceController`.
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
  return `${apiBase}/api/public/invoice/pdf?token=${encodeURIComponent(token)}`;
}
