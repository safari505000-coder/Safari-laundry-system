import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';

/**
 * V21 Phase 3 — Canonical Banking Hash.
 *
 * Deterministic, key-order independent JSON canonicalisation and
 * SHA-256 hashing for read-only financial state.
 *
 * Used by:
 *  - statement snapshot envelopes
 *  - replay engine equality assertions
 *  - golden contract tests
 *  - future signed PDF / external audit exports
 *
 * INVARIANTS:
 *  - Same logical state ⇒ same hash, regardless of object key order.
 *  - Decimal values are stringified at exactly 4dp so JS float drift can
 *    never reach the hash.
 *  - Arrays preserve order — callers MUST enforce a deterministic
 *    ordering before hashing (e.g. by `id` or `atIso`).
 *  - undefined and explicit null normalise to JSON null so callers can
 *    drop optional fields without changing the hash.
 *  - Non-finite numbers throw — banking-safe systems never hash NaN.
 */
/**
 * يُحوّل قيمة إلى JSON كانونية قابلة للمقارنة بغض النظر عن ترتيب المفاتيح
 * Converts a value to deterministic, key-order-independent canonical JSON string.
 * Decimals are stringified at exactly 4dp; undefined/null normalize to null.
 *
 * @param value - القيمة المُراد تحويلها | Value to canonicalize
 * @returns سلسلة JSON كانونية | Canonical JSON string
 * @throws Error إذا كان الرقم غير محدود | If value contains a non-finite number
 * @since V21 Phase 3
 */
export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/**
 * يُنتج هاش SHA-256 لقيمة مُستخدَمًا التسلسل الكانوني
 * Produces a SHA-256 hex hash of any value using canonical JSON serialisation.
 * Same logical state → same hash regardless of object key order.
 *
 * @param value - القيمة المُراد تشفيرها | Value to hash
 * @returns هاش SHA-256 بالنظام الست عشري | SHA-256 hex string
 * @since V21 Phase 3
 */
export function canonicalHash(value: unknown): string {
  const json = canonicalJsonStringify(value);
  return createHash('sha256').update(json, 'utf8').digest('hex');
}

function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Prisma.Decimal) return value.toFixed(4);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(
        `canonicalJsonStringify: refusing to hash non-finite number ${value}`,
      );
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => canonicalize(v));
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = canonicalize(obj[key]);
    }
    return out;
  }
  return value;
}
