import { Prisma } from '@prisma/client';

/**
 * Phase 1 extraction — pure, stateless payment-gateway callback validation
 * helpers split out of `payments.service.ts`. These functions take all inputs
 * as parameters (no `this`, no I/O, no DB, no finalization). `PaymentsService`
 * delegates to them, so behaviour and the public `normalizeCallbackStatus`
 * surface are unchanged. Payment finalization and financial writes are NOT
 * touched here.
 */

/** True when the URL points at a local/loopback host (unsafe as a public callback base). */
export function looksLikeLocalHost(url: string): boolean {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(url);
}

/**
 * يطبع حالة بوابة الدفع إلى نجاح أو فشل قبل أي أثر مالي على الطلب أو المحفظة.
 * Normalizes gateway callback status to success or failed before any order,
 * wallet, or ledger effect.
 * @param status - الحالة الخام القادمة من البوابة / Raw gateway status
 * @returns الحالة الموحدة للمعالجة / Normalized processing status
 */
export function normalizeCallbackStatus(status: string): 'success' | 'failed' {
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

/** Reads the persisted `charge.amountKd` from a payment-link metadata blob, if present. */
export function readStoredPaymentLinkChargeKd(
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

/** True when stored and current link charge amounts agree within tolerance. */
export function paymentLinkChargeMatches(
  stored: Prisma.Decimal,
  current: Prisma.Decimal,
  tolerance: Prisma.Decimal,
): boolean {
  return stored.sub(current).abs().lessThanOrEqualTo(tolerance);
}
