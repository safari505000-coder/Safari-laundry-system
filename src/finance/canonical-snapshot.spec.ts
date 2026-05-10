import { canonicalHash } from './canonical-hash';
import {
  buildCanonicalSnapshot,
  CANONICAL_SNAPSHOT_VERSION,
  verifyCanonicalSnapshot,
} from './canonical-snapshot';

describe('buildCanonicalSnapshot', () => {
  it('wraps a payload with version, hash and lineage metadata', () => {
    const payload = { totals: { totalInvoicedKd: '10.0000' } };
    const envelope = buildCanonicalSnapshot({
      payload,
      sourceEventIds: ['e2', 'e1'],
      sourceInvoiceIds: ['inv-b', 'inv-a'],
      generatedAtIso: '2026-05-08T12:00:00.000Z',
    });
    expect(envelope.snapshotVersion).toBe(CANONICAL_SNAPSHOT_VERSION);
    expect(envelope.generatedAtIso).toBe('2026-05-08T12:00:00.000Z');
    expect(envelope.canonicalHash).toBe(canonicalHash(payload));
    expect(envelope.sourceEventIds).toEqual(['e1', 'e2']);
    expect(envelope.sourceInvoiceIds).toEqual(['inv-a', 'inv-b']);
  });

  it('produces byte-identical envelopes for the same logical state', () => {
    const a = buildCanonicalSnapshot({
      payload: { totals: { totalInvoicedKd: '10.0000' } },
      sourceEventIds: ['e1'],
      sourceInvoiceIds: ['inv-1'],
      generatedAtIso: '2026-05-08T00:00:00.000Z',
    });
    const b = buildCanonicalSnapshot({
      payload: { totals: { totalInvoicedKd: '10.0000' } },
      sourceEventIds: ['e1'],
      sourceInvoiceIds: ['inv-1'],
      generatedAtIso: '2026-05-08T00:00:00.000Z',
    });
    expect(a).toEqual(b);
    expect(a.canonicalHash).toBe(b.canonicalHash);
  });

  it('changes the hash when any payload value changes', () => {
    const base = buildCanonicalSnapshot({
      payload: { totals: { totalInvoicedKd: '10.0000' } },
      sourceEventIds: [],
      sourceInvoiceIds: [],
      generatedAtIso: '2026-05-08T00:00:00.000Z',
    });
    const drift = buildCanonicalSnapshot({
      payload: { totals: { totalInvoicedKd: '10.0010' } },
      sourceEventIds: [],
      sourceInvoiceIds: [],
      generatedAtIso: '2026-05-08T00:00:00.000Z',
    });
    expect(base.canonicalHash).not.toBe(drift.canonicalHash);
  });

  it('freezes the envelope so downstream cannot mutate financial truth', () => {
    const envelope = buildCanonicalSnapshot({
      payload: { totals: { totalInvoicedKd: '10.0000' } },
      sourceEventIds: ['e1'],
      sourceInvoiceIds: ['inv-1'],
      generatedAtIso: '2026-05-08T00:00:00.000Z',
    });
    expect(Object.isFrozen(envelope)).toBe(true);
    expect(Object.isFrozen(envelope.payload)).toBe(true);
    expect(Object.isFrozen(envelope.payload.totals)).toBe(true);
    expect(Object.isFrozen(envelope.sourceEventIds)).toBe(true);
  });

  it('drops empty string ids from lineage so noise cannot drift the envelope', () => {
    const envelope = buildCanonicalSnapshot({
      payload: { totals: { totalInvoicedKd: '0.0000' } },
      sourceEventIds: ['', 'e1', '', 'e2'],
      sourceInvoiceIds: [''],
      generatedAtIso: '2026-05-08T00:00:00.000Z',
    });
    expect(envelope.sourceEventIds).toEqual(['e1', 'e2']);
    expect(envelope.sourceInvoiceIds).toEqual([]);
  });
});

describe('verifyCanonicalSnapshot', () => {
  it('returns true while the payload still matches the embedded hash', () => {
    const envelope = buildCanonicalSnapshot({
      payload: { totals: { totalInvoicedKd: '10.0000' } },
      sourceEventIds: ['e1'],
      sourceInvoiceIds: [],
      generatedAtIso: '2026-05-08T00:00:00.000Z',
    });
    expect(verifyCanonicalSnapshot(envelope)).toBe(true);
  });

  it('detects mutation attempts via tampered envelope copies', () => {
    const envelope = buildCanonicalSnapshot({
      payload: { totals: { totalInvoicedKd: '10.0000' } },
      sourceEventIds: [],
      sourceInvoiceIds: [],
      generatedAtIso: '2026-05-08T00:00:00.000Z',
    });
    const tampered = {
      ...envelope,
      payload: { totals: { totalInvoicedKd: '999.0000' } },
    };
    expect(verifyCanonicalSnapshot(tampered)).toBe(false);
  });
});
