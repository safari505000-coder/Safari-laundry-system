import {
  detectDuplicateSettlements,
  detectDuplicateSourceRefs,
  detectOrphanWalletEvents,
  detectReplayAnomaly,
  detectStaleSnapshots,
} from './banking-anomaly-detectors';

const AT = '2026-05-08T20:00:00.000Z';

describe('V21 Phase 6 — banking anomaly detectors', () => {
  describe('detectDuplicateSourceRefs', () => {
    it('returns green on empty input', () => {
      const out = detectDuplicateSourceRefs({ rows: [], at: AT });
      expect(out.health).toBe('green');
      expect(out.count).toBe(0);
    });

    it('flags red the moment any sourceRef appears more than once', () => {
      const out = detectDuplicateSourceRefs({
        at: AT,
        rows: [
          {
            sourceRef: 'PAYMENT:abc',
            source: 'PAYMENT',
            createdAt: new Date('2026-05-08T19:00:00Z'),
          },
          {
            sourceRef: 'PAYMENT:abc',
            source: 'PAYMENT',
            createdAt: new Date('2026-05-08T19:30:00Z'),
          },
          {
            sourceRef: 'PAYMENT:def',
            source: 'PAYMENT',
            createdAt: new Date('2026-05-08T19:45:00Z'),
          },
        ],
      });
      expect(out.health).toBe('red');
      expect(out.count).toBe(1);
      expect(out.samples[0].sourceRef).toBe('PAYMENT:abc');
      expect(out.samples[0].occurrences).toBe(2);
    });
  });

  describe('detectOrphanWalletEvents', () => {
    it('returns green when every event matches a journal sourceRef', () => {
      const out = detectOrphanWalletEvents({
        at: AT,
        outbox: [
          {
            id: 'evt-1',
            eventType: 'finance.payment.captured',
            sourceRef: 'PAYMENT:abc',
            emittedAt: new Date(AT),
          },
        ],
        journalSourceRefs: new Set(['PAYMENT:abc']),
      });
      expect(out.health).toBe('green');
      expect(out.count).toBe(0);
    });

    it('flags amber on a single orphan with default thresholds', () => {
      const out = detectOrphanWalletEvents({
        at: AT,
        outbox: [
          {
            id: 'evt-1',
            eventType: 'finance.payment.captured',
            sourceRef: 'PAYMENT:abc',
            emittedAt: new Date(AT),
          },
        ],
        journalSourceRefs: new Set([]),
      });
      expect(out.health).toBe('amber');
      expect(out.count).toBe(1);
    });

    it('flags red beyond the red threshold', () => {
      const out = detectOrphanWalletEvents({
        at: AT,
        outbox: Array.from({ length: 5 }, (_v, i) => ({
          id: `evt-${i}`,
          eventType: 'finance.payment.captured',
          sourceRef: `PAYMENT:${i}`,
          emittedAt: new Date(AT),
        })),
        journalSourceRefs: new Set([]),
      });
      expect(out.health).toBe('red');
      expect(out.count).toBe(5);
    });

    it('skips events without a sourceRef (cannot match)', () => {
      const out = detectOrphanWalletEvents({
        at: AT,
        outbox: [
          {
            id: 'evt-1',
            eventType: 'finance.snapshot.refresh',
            sourceRef: null,
            emittedAt: new Date(AT),
          },
        ],
        journalSourceRefs: new Set([]),
      });
      expect(out.count).toBe(0);
      expect(out.health).toBe('green');
    });
  });

  describe('detectStaleSnapshots', () => {
    it('returns green when all snapshots are within SLA', () => {
      const out = detectStaleSnapshots({
        at: AT,
        rows: [
          {
            customerId: 'cust-1',
            generatedAt: new Date('2026-05-08T19:55:00Z'),
          },
        ],
        maxAgeSec: 3600,
      });
      expect(out.health).toBe('green');
      expect(out.count).toBe(0);
    });

    it('counts every snapshot older than SLA', () => {
      const out = detectStaleSnapshots({
        at: AT,
        rows: [
          {
            customerId: 'cust-1',
            generatedAt: new Date('2026-05-08T18:00:00Z'),
          },
          {
            customerId: 'cust-2',
            generatedAt: new Date('2026-05-08T17:00:00Z'),
          },
          {
            customerId: 'cust-3',
            generatedAt: new Date('2026-05-08T19:50:00Z'),
          },
        ],
        maxAgeSec: 3600,
      });
      expect(out.count).toBe(2);
      expect(out.health).toBe('green'); // < amber threshold (5)
    });

    it('escalates with custom thresholds', () => {
      const out = detectStaleSnapshots({
        at: AT,
        rows: [
          {
            customerId: 'cust-1',
            generatedAt: new Date('2026-05-08T17:00:00Z'),
          },
        ],
        maxAgeSec: 3600,
        thresholds: { amber: 1, red: 10 },
      });
      expect(out.health).toBe('amber');
    });
  });

  describe('detectDuplicateSettlements', () => {
    it('returns green when no order has a duplicate settlement', () => {
      const out = detectDuplicateSettlements({
        at: AT,
        rows: [
          {
            orderId: 'ord-1',
            amountKd: '5.000',
            settledAt: new Date('2026-05-08T19:00:00Z'),
          },
          {
            orderId: 'ord-2',
            amountKd: '7.000',
            settledAt: new Date('2026-05-08T19:01:00Z'),
          },
        ],
      });
      expect(out.health).toBe('green');
      expect(out.count).toBe(0);
    });

    it('flags amber when the same order is settled twice within the window', () => {
      const out = detectDuplicateSettlements({
        at: AT,
        rows: [
          {
            orderId: 'ord-1',
            amountKd: '5.000',
            settledAt: new Date('2026-05-08T19:00:00Z'),
          },
          {
            orderId: 'ord-1',
            amountKd: '5.000',
            settledAt: new Date('2026-05-08T19:00:30Z'),
          },
        ],
      });
      expect(out.health).toBe('amber');
      expect(out.count).toBe(1);
      expect(out.samples[0].occurrences).toBe(2);
    });

    it('does not flag re-settlements outside the window', () => {
      const out = detectDuplicateSettlements({
        at: AT,
        rows: [
          {
            orderId: 'ord-1',
            amountKd: '5.000',
            settledAt: new Date('2026-05-08T18:00:00Z'),
          },
          {
            orderId: 'ord-1',
            amountKd: '5.000',
            settledAt: new Date('2026-05-08T19:30:00Z'),
          },
        ],
        windowSec: 60,
      });
      expect(out.health).toBe('green');
      expect(out.count).toBe(0);
    });
  });

  describe('detectReplayAnomaly', () => {
    it('returns green when every replay matches', () => {
      const out = detectReplayAnomaly({
        at: AT,
        triples: [
          {
            customerId: 'cust-1',
            expectedHash: 'h1',
            actualHash: 'h1',
          },
          {
            customerId: 'cust-2',
            expectedHash: 'h2',
            actualHash: 'h2',
          },
        ],
      });
      expect(out.health).toBe('green');
      expect(out.count).toBe(0);
    });

    it('flags red the moment any replay diverges', () => {
      const out = detectReplayAnomaly({
        at: AT,
        triples: [
          {
            customerId: 'cust-1',
            expectedHash: 'h1',
            actualHash: 'DIFFERENT',
          },
        ],
      });
      expect(out.health).toBe('red');
      expect(out.count).toBe(1);
    });
  });
});
