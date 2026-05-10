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
export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

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
