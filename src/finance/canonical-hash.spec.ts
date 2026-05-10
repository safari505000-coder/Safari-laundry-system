import { Prisma } from '@prisma/client';
import { canonicalHash, canonicalJsonStringify } from './canonical-hash';

describe('canonicalJsonStringify', () => {
  it('is independent of object key order', () => {
    const a = { totalKd: '3.2500', count: 2, openDebt: true };
    const b = { openDebt: true, count: 2, totalKd: '3.2500' };
    expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
  });

  it('serialises Decimal at exactly 4dp', () => {
    expect(canonicalJsonStringify(new Prisma.Decimal('3.25'))).toBe('"3.2500"');
    expect(canonicalJsonStringify(new Prisma.Decimal('0'))).toBe('"0.0000"');
  });

  it('serialises Date as ISO string', () => {
    expect(
      canonicalJsonStringify(new Date('2026-05-08T15:30:00.000Z')),
    ).toBe('"2026-05-08T15:30:00.000Z"');
  });

  it('normalises undefined and null to null', () => {
    expect(canonicalJsonStringify({ a: undefined, b: null })).toBe(
      '{"a":null,"b":null}',
    );
  });

  it('preserves array order (callers must pre-sort)', () => {
    expect(canonicalJsonStringify([3, 1, 2])).toBe('[3,1,2]');
  });

  it('refuses to hash non-finite numbers', () => {
    expect(() => canonicalJsonStringify({ x: Number.NaN })).toThrow(
      /non-finite/,
    );
    expect(() => canonicalJsonStringify({ x: Number.POSITIVE_INFINITY }))
      .toThrow(/non-finite/);
  });
});

describe('canonicalHash', () => {
  it('produces stable SHA-256 hex for the same logical state', () => {
    const a = canonicalHash({ totalKd: '3.2500', count: 2 });
    const b = canonicalHash({ count: 2, totalKd: '3.2500' });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when any financial value changes', () => {
    const a = canonicalHash({ totalKd: '3.2500' });
    const b = canonicalHash({ totalKd: '3.2510' });
    expect(a).not.toBe(b);
  });

  it('treats Decimal and matching 4dp string as equivalent', () => {
    expect(canonicalHash({ totalKd: new Prisma.Decimal('3.25') })).toBe(
      canonicalHash({ totalKd: '3.2500' }),
    );
  });

  it('produces identical hash for identical statement projections', () => {
    const projection = {
      customer: { id: 'c-1', operationalDebtKd: '5.0000' },
      totals: {
        totalInvoicedKd: '10.0000',
        totalOpenInvoicesKd: '5.0000',
        totalPaidInvoicesKd: '5.0000',
        unpaidInvoiceCount: 1,
        paidInvoiceCount: 1,
        canceledInvoiceCount: 0,
      },
      events: [
        {
          id: 'e-1',
          atIso: '2026-05-01T10:00:00.000Z',
          amountKd: '5.0000',
        },
      ],
    };
    const replayed = {
      events: [
        {
          amountKd: '5.0000',
          atIso: '2026-05-01T10:00:00.000Z',
          id: 'e-1',
        },
      ],
      totals: {
        canceledInvoiceCount: 0,
        paidInvoiceCount: 1,
        unpaidInvoiceCount: 1,
        totalPaidInvoicesKd: '5.0000',
        totalOpenInvoicesKd: '5.0000',
        totalInvoicedKd: '10.0000',
      },
      customer: { operationalDebtKd: '5.0000', id: 'c-1' },
    };
    const a = canonicalHash(projection);
    const b = canonicalHash(replayed);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
