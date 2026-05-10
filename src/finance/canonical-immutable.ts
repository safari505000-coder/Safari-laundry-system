/**
 * V21 Phase 3 — Canonical Banking DTO Immutability.
 *
 * Helpers to enforce deep immutability for canonical financial DTOs in
 * dev/test, while staying zero-cost in production (where downstream
 * consumers are forbidden by static guards from mutating the payloads
 * anyway).
 *
 * Use `deepFreezeCanonical()` at the boundary where a canonical
 * projection or snapshot leaves the projection layer.
 */

const DEEP_FREEZE_ENABLED =
  process.env.NODE_ENV === 'development' ||
  process.env.NODE_ENV === 'test' ||
  process.env.SAFARI_FORCE_DEEP_FREEZE === '1';

export type DeepReadonly<T> = T extends ReadonlyArray<infer U>
  ? ReadonlyArray<DeepReadonly<U>>
  : T extends ReadonlyMap<infer K, infer V>
    ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
    : T extends ReadonlySet<infer M>
      ? ReadonlySet<DeepReadonly<M>>
      : T extends object
        ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T;

/**
 * Deep-freeze a canonical financial payload in dev/test so any
 * accidental adapter/UI/print mutation throws immediately. In
 * production the call is a no-op so we pay zero serialisation cost.
 */
export function deepFreezeCanonical<T>(value: T): DeepReadonly<T> {
  if (!DEEP_FREEZE_ENABLED) {
    return value as DeepReadonly<T>;
  }
  return deepFreezeRecursive(value);
}

function deepFreezeRecursive<T>(value: T): DeepReadonly<T> {
  if (value === null || typeof value !== 'object') {
    return value as DeepReadonly<T>;
  }
  if (Object.isFrozen(value)) {
    return value as DeepReadonly<T>;
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    deepFreezeRecursive(obj[key]);
  }
  return Object.freeze(value) as DeepReadonly<T>;
}
