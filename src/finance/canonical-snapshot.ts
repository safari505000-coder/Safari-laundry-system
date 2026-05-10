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
export const CANONICAL_SNAPSHOT_VERSION = 'v21.3.0';

export type CanonicalSnapshotEnvelope<TPayload> = {
  snapshotVersion: string;
  generatedAtIso: string;
  canonicalHash: string;
  sourceEventIds: ReadonlyArray<string>;
  sourceInvoiceIds: ReadonlyArray<string>;
  payload: DeepReadonly<TPayload>;
};

export type BuildCanonicalSnapshotInput<TPayload> = {
  payload: TPayload;
  sourceEventIds: ReadonlyArray<string>;
  sourceInvoiceIds: ReadonlyArray<string>;
  generatedAtIso?: string;
  snapshotVersion?: string;
};

/**
 * Builds a canonical snapshot envelope around a read-only payload.
 *
 * The hash is computed from the *payload only*, with deterministic JSON
 * canonicalisation (sorted keys, 4dp decimals, ISO dates). Source IDs
 * are sorted before being embedded so two replays over the same data
 * produce byte-identical envelopes.
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
 * Verifies a canonical snapshot envelope still matches its embedded
 * hash. Returns true when the payload has not been mutated since the
 * snapshot was generated. Used by replay assertions and audit checks.
 */
export function verifyCanonicalSnapshot<TPayload>(
  envelope: CanonicalSnapshotEnvelope<TPayload>,
): boolean {
  return canonicalHash(envelope.payload) === envelope.canonicalHash;
}
