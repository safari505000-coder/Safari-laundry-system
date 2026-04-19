/**
 * Safari Omni — backend brand constants (V6.8 dual-branding).
 *
 * Mirrors `web/src/lib/brand.ts` so audit trails, API docs, error envelopes,
 * and any server-rendered text use the same identity split between
 * customer-facing and system-facing surfaces.
 */

/** Customer-facing trade name (receipts, invoices, public documents).
 *  V6.8 — corrected to plural "مجموعة مصابغ" to match the legal trade form. */
export const BRAND_CUSTOMER_EN = 'Safari Express Laundries Group';
export const BRAND_CUSTOMER_AR = 'مجموعة مصابغ سفاري السريعة';

/** Internal system / product name (dashboards, admin tools, audit logs). */
export const BRAND_SYSTEM_EN = 'Safari Omni';
export const BRAND_SYSTEM_AR = 'سفاري أوميني';

/** Legacy aliases kept so existing imports do not break mid-migration. */
export const APP_BRAND = BRAND_CUSTOMER_EN;
export const APP_BRAND_ERP = `${BRAND_CUSTOMER_EN} — ${BRAND_SYSTEM_EN} ERP`;
