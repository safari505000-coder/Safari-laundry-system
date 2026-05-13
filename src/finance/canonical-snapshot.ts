import { canonicalHash } from './canonical-hash';
import { deepFreezeCanonical, type DeepReadonly } from './canonical-immutable';

/**
 * V21 Phase 3 — Canonical Banking Snapshot Envelope.
 *
 * Wraps any canonical projection payload with the metadata required by
 * an audit-grade banking system:
 *
 *  - `snapshotVersion`: semver-style schema tag the consumer can pin.
 *    Bump only when the payload contract changes; never silently mutate.
 *  - `generatedAt`: ISO timestamp of snapshot generation.
 *  - `canonicalHash`: SHA-256 of the canonicalised payload (key-order
 *    independent, decimal-stable). Same logical state ⇒ same hash.
 *  - `sourceEventIds`: ledger / transaction event IDs the projection
 *    was derived from (audit lineage).
 *  - `sourceInvoiceIds`: invoice IDs the projection was derived from.
 *
 * The snapshot envelope itself is deep-frozen in dev/test so any
 * downstream mutation (UI, adapter, print layer) throws immediately.
 */
/**
 * إصدار مخطط الغلاف الكانوني للقطة المالية
 * Canonical snapshot envelope schema version (bump only when payload contract changes).
 */
export const CANONICAL_SNAPSHOT_VERSION = 'v21.3.0';

/**
 * غلاف اللقطة الكانونية للمراجعة البنكية — يتضمن الهاش ومصادر الأحداث
 * Canonical banking snapshot envelope wrapping any projection payload with
 * version, timestamp, SHA-256 hash, and source event/invoice IDs for audit lineage.
 */
export type CanonicalSnapshotEnvelope<TPayload> = {
  snapshotVersion: string;
  generatedAtIso: string;
  canonicalHash: string;
  sourceEventIds: ReadonlyArray<string>;
  sourceInvoiceIds: ReadonlyArray<string>;
  payload: DeepReadonly<TPayload>;
};

/**
 * مدخلات بناء الغلاف الكانوني للقطة المالية
 * Input for constructing a canonical snapshot envelope.
 */
export type BuildCanonicalSnapshotInput<TPayload> = {
  payload: TPayload;
  sourceEventIds: ReadonlyArray<string>;
  sourceInvoiceIds: ReadonlyArray<string>;
  generatedAtIso?: string;
  snapshotVersion?: string;
};

/**
 * يبني غلافاً كانونياً حول حمولة بيانات للقراءة فقط مع الهاش ومصادر الأحداث
 * Builds a canonical snapshot envelope around a read-only payload.
 * Hash is computed from payload only (sorted keys, 4dp decimals, ISO dates).
 * Source IDs are sorted for byte-identical replay.
 *
 * @param input - مدخلات بناء الغلاف | Snapshot build input
 * @returns الغلاف الكانوني المجمّد | Deep-frozen canonical snapshot envelope
 * @since V21 Phase 3
 */
export function buildCanonicalSnapshot<TPayload>(
  input: BuildCanonicalSnapshotInput<TPayload>,
): CanonicalSnapshotEnvelope<TPayload> {
  const sortedEventIds = [...input.sourceEventIds]
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .sort();
  const sortedInvoiceIds = [...input.sourceInvoiceIds]
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .sort();

  const envelope: CanonicalSnapshotEnvelope<TPayload> = {
    snapshotVersion: input.snapshotVersion ?? CANONICAL_SNAPSHOT_VERSION,
    generatedAtIso: input.generatedAtIso ?? new Date().toISOString(),
    canonicalHash: canonicalHash(input.payload),
    sourceEventIds: sortedEventIds,
    sourceInvoiceIds: sortedInvoiceIds,
    payload: deepFreezeCanonical(input.payload),
  };

  return deepFreezeCanonical(envelope) as CanonicalSnapshotEnvelope<TPayload>;
}

/**
 * يتحقق من أن غلاف اللقطة الكانونية لا يزال يطابق هاشه المُضمَّن
 * Verifies that the payload hash still matches the embedded canonicalHash.
 * Used by replay assertions and audit checks.
 *
 * @param envelope - غلاف اللقطة الكانونية | Canonical snapshot envelope
 * @returns true إذا كان الهاش صالحاً | Whether the hash is still valid
 */
export function verifyCanonicalSnapshot<TPayload>(
  envelope: CanonicalSnapshotEnvelope<TPayload>,
): boolean {
  return canonicalHash(envelope.payload) === envelope.canonicalHash;
}
