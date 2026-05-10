/**
 * Shared SSoT helper.
 *
 * The single sanctioned per-driver cash value in the system is
 * `classified.drivers[].amount`, produced by `CashClassifierService`.
 * Every other layer (risk, live, operational, executive, explain,
 * exposure, scope helpers, frontend) MUST consume that value via this
 * map instead of re-aggregating from raw flows.
 *
 * The function is pure, allocation-light, and contains no policy.
 * It is safe to call once per request and pass the result through.
 *
 * Contract:
 *   - Input: anything with a `.drivers` array of `{ driverId, amount }`.
 *   - Output: Map<driverId, "0.0000"-style KD string> verbatim from
 *     the classifier. Read-only logically; callers must not mutate.
 *
 * Lookup helper `getDriverAmountKd` parses safely and returns 0 KD
 * when the driver is not present (e.g. driver appeared in operational
 * filtering but has no row in the classifier output).
 */

export interface ClassifiedLikeDriver {
  driverId: string;
  amount: string;
}

export interface ClassifiedLike {
  drivers: ReadonlyArray<ClassifiedLikeDriver>;
}

export type DriverAmountMap = ReadonlyMap<string, string>;

export function buildDriverAmountMap(
  classified: ClassifiedLike,
): DriverAmountMap {
  const m = new Map<string, string>();
  for (const d of classified.drivers) {
    m.set(d.driverId, d.amount);
  }
  return m;
}

export function getDriverAmountStr(
  map: DriverAmountMap,
  driverId: string,
): string {
  return map.get(driverId) ?? '0.0000';
}

export function getDriverAmountKd(
  map: DriverAmountMap,
  driverId: string,
): number {
  const s = map.get(driverId);
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Σ across all drivers in the classified payload. The canonical total
 * cash-in-flight figure for the system. Used by composeLive,
 * composeOperational, executive auditReference, and the SSoT
 * assertion.
 */
function sumClassifiedKd(classified: ClassifiedLike): number {
  let s = 0;
  for (const d of classified.drivers) {
    const n = Number(d.amount);
    if (Number.isFinite(n)) s += n;
  }
  return s;
}

export function sumClassifiedKdLabel(classified: ClassifiedLike): string {
  return sumClassifiedKd(classified).toFixed(4);
}

