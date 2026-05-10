import { canonicalHash } from './canonical-hash';
import {
  replayStatementProjection,
  replayStatementSnapshot,
} from './canonical-replay';
import { verifyCanonicalSnapshot } from './canonical-snapshot';

const FIXED_INVOICES = [
  { id: 'inv-2', totalKd: '5.2500', status: 'COMPLETED', openDebt: true },
  { id: 'inv-1', totalKd: '10.0000', status: 'COMPLETED', openDebt: false },
  { id: 'inv-3', totalKd: '99.0000', status: 'CANCELED', openDebt: true },
];

const FIXED_EVENTS = [
  {
    id: 'e-2',
    atIso: '2026-05-02T00:00:00.000Z',
    kind: 'ORDER_PAID_IN_FULL',
    amountKd: '10.0000',
    balanceAfterKd: '0.0000',
    debtAfterKd: '0.0000',
    debtSettledKd: '0.0000',
    debtDiscountKd: '0.0000',
  },
  {
    id: 'e-1',
    atIso: '2026-05-01T00:00:00.000Z',
    kind: 'SUBSCRIPTION_ACTIVATION',
    amountKd: '40.0000',
    balanceAfterKd: '-2.0000',
    debtAfterKd: '3.0000',
    debtSettledKd: '5.0000',
    debtDiscountKd: '0.0000',
    closedInvoices: [{ id: 'inv-1', totalKd: '10.0000' }],
  },
];

describe('replayStatementProjection', () => {
  it('reconstructs canonical totals from raw invoices', () => {
    const replay = replayStatementProjection(FIXED_INVOICES, []);
    expect(replay.totals).toEqual({
      totalInvoicedKd: '15.2500',
      totalPaidInvoicesKd: '10.0000',
      totalOpenInvoicesKd: '5.2500',
      unpaidInvoiceCount: 1,
      paidInvoiceCount: 1,
      canceledInvoiceCount: 1,
    });
  });

  it('orders invoices and events deterministically regardless of input order', () => {
    const a = replayStatementProjection(FIXED_INVOICES, FIXED_EVENTS);
    const b = replayStatementProjection(
      [...FIXED_INVOICES].reverse(),
      [...FIXED_EVENTS].reverse(),
    );
    expect(a).toEqual(b);
    expect(a.invoices.map((i) => i.id)).toEqual(['inv-1', 'inv-2', 'inv-3']);
    expect(a.events.map((e) => e.id)).toEqual(['e-1', 'e-2']);
  });

  it('attaches the canonical projection group to every invoice', () => {
    const replay = replayStatementProjection(FIXED_INVOICES, []);
    expect(replay.invoices.map((i) => i.projectionGroup)).toEqual([
      'PAID',
      'UNPAID',
      'CANCELED',
    ]);
  });

  it('attaches the canonical event projection (credit, debt, closed invoices)', () => {
    const replay = replayStatementProjection(FIXED_INVOICES, FIXED_EVENTS);
    const activation = replay.events.find((e) => e.id === 'e-1');
    expect(activation?.projection).toEqual({
      isCredit: true,
      effectiveDebtAfterKd: '5.0000',
      hasDebtDiscount: false,
      hasDebtSettled: true,
      closedInvoicesTotalKd: '10.0000',
    });
  });

  it('produces the same canonical hash for identical statements', () => {
    const a = replayStatementProjection(FIXED_INVOICES, FIXED_EVENTS);
    const b = replayStatementProjection(
      [...FIXED_INVOICES].reverse(),
      [...FIXED_EVENTS].reverse(),
    );
    expect(canonicalHash(a)).toBe(canonicalHash(b));
  });
});

describe('replayStatementSnapshot', () => {
  it('wraps the replay in a hash-verifiable, lineage-tagged envelope', () => {
    const snapshot = replayStatementSnapshot({
      invoices: FIXED_INVOICES,
      events: FIXED_EVENTS,
      generatedAtIso: '2026-05-08T00:00:00.000Z',
    });
    expect(snapshot.snapshotVersion).toBe('v21.3.0');
    expect(snapshot.canonicalHash).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot.sourceInvoiceIds).toEqual(['inv-1', 'inv-2', 'inv-3']);
    expect(snapshot.sourceEventIds).toEqual(['e-1', 'e-2']);
    expect(verifyCanonicalSnapshot(snapshot)).toBe(true);
  });

  it('produces byte-identical envelopes for replayed statements', () => {
    const a = replayStatementSnapshot({
      invoices: FIXED_INVOICES,
      events: FIXED_EVENTS,
      generatedAtIso: '2026-05-08T00:00:00.000Z',
    });
    const b = replayStatementSnapshot({
      invoices: [...FIXED_INVOICES].reverse(),
      events: [...FIXED_EVENTS].reverse(),
      generatedAtIso: '2026-05-08T00:00:00.000Z',
    });
    expect(a).toEqual(b);
  });
});
