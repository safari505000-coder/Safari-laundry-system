/**
 * Kuwait timezone helpers — DUSTUR §2.
 *
 * The financial/operational cycle is defined in Asia/Kuwait (UTC+03:00, no DST)
 * and rolls at local midnight. The OWNER owns this cycle; drivers and managers
 * do not open or close shifts manually.
 */

export const KUWAIT_OFFSET_MIN = 180;
export const KUWAIT_TIMEZONE = 'Asia/Kuwait';

/**
 * Returns the UTC instant corresponding to the most recent Kuwait-local
 * midnight (00:00:00.000) that precedes or equals `nowUtc`.
 *
 * Example: if it's 2026-04-19 14:37 Kuwait, returns 2026-04-18 21:00:00 UTC
 * (which is 2026-04-19 00:00:00 +03:00).
 */
export function kuwaitMidnightUtc(nowUtc: Date): Date {
  const k = new Date(nowUtc.getTime() + KUWAIT_OFFSET_MIN * 60_000);
  const y = k.getUTCFullYear();
  const m = k.getUTCMonth();
  const d = k.getUTCDate();
  const utcMs = Date.UTC(y, m, d, 0, 0, 0, 0) - KUWAIT_OFFSET_MIN * 60_000;
  return new Date(utcMs);
}

/**
 * Returns the UTC instant of the next upcoming Kuwait-local midnight strictly
 * after `nowUtc`. Useful for displaying the next cycle boundary.
 */
export function nextKuwaitMidnightUtc(nowUtc: Date): Date {
  const today = kuwaitMidnightUtc(nowUtc);
  return new Date(today.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Returns the current Kuwait-local hour (0-23) for `nowUtc`.
 */
export function kuwaitHour(nowUtc: Date): number {
  const k = new Date(nowUtc.getTime() + KUWAIT_OFFSET_MIN * 60_000);
  return k.getUTCHours();
}

/**
 * Returns the Kuwait-local calendar date for `nowUtc` formatted as
 * `YYYY-MM-DD`. V19.9 — used as the indexable key on InvoiceAuditLog
 * so date-range reports can run as simple equality lookups without a
 * timezone-aware WHERE.
 */
export function kuwaitDayIso(nowUtc: Date): string {
  const k = new Date(nowUtc.getTime() + KUWAIT_OFFSET_MIN * 60_000);
  const y = k.getUTCFullYear();
  const m = String(k.getUTCMonth() + 1).padStart(2, '0');
  const d = String(k.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * True when `a` and `b` fall on the same Kuwait-local calendar day.
 * V19.9 — gate for the Call-Center Supervisor's same-day invoice
 * edit. Identity is symmetrical and timezone-correct across DST-free
 * Asia/Kuwait.
 */
export function isSameKuwaitDay(a: Date, b: Date): boolean {
  return kuwaitDayIso(a) === kuwaitDayIso(b);
}
