/**
 * Safari Omni — dual-branding source of truth (V6.8).
 *
 * The system runs under two distinct identities so that staff-facing surfaces
 * speak the product name while customer-facing surfaces speak the legal trade
 * name. Any UI, receipt, or message that references "the app" MUST import
 * from this module — never hard-code brand strings inline.
 *
 *   • CUSTOMER-FACING  → receipts, invoices, printouts, WhatsApp to customers,
 *                        OG / share cards, anything a customer ever reads.
 *   • SYSTEM-FACING    → dashboard chrome, sidebar, page titles, admin tools,
 *                        login screen, system-closed notice, audit exports.
 */

export const BRAND = Object.freeze({
  /** Legal trade name shown to customers (receipts, WhatsApp, share cards).
   *  V6.8 — corrected to the plural legal-trade form "مجموعة مصابغ".
   *  All customer-facing copy MUST read from this constant; never
   *  hard-code the Arabic name inline. */
  customerAr: 'مجموعة مصابغ سفاري السريعة',
  customerEn: 'Safari Express Laundries Group',

  /** Internal product name shown to staff (dashboard, nav, titles). */
  systemEn: 'Safari Omni',
  systemAr: 'سفاري أوميني',

  /** Short operational tagline under the system name in the shell logo. */
  systemTagline: 'AI-Powered Operations',

  /** Full copyright suffix — used on login + report footers. */
  copyrightEn: 'Safari Omni © 2026 — All rights reserved to Safari Express Laundries Group.',
  copyrightAr: 'Safari Omni © 2026 — جميع الحقوق محفوظة لمجموعة مصابغ سفاري السريعة.',

  /** Customer-facing PNG mark for receipts/invoices (thermal + browser print). */
  brandMarkPath: '/logo.png',
});

export type BrandFace = 'customer' | 'system';

/** Pick the right brand name for a UI surface + language pair. */
export function brandName(face: BrandFace, lang: 'ar' | 'en'): string {
  if (face === 'customer') {
    return lang === 'ar' ? BRAND.customerAr : BRAND.customerEn;
  }
  return lang === 'ar' ? BRAND.systemAr : BRAND.systemEn;
}
