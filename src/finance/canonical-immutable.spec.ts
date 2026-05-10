import { deepFreezeCanonical } from './canonical-immutable';

describe('deepFreezeCanonical', () => {
  it('deep-freezes nested objects in test mode', () => {
    const payload = {
      totals: {
        totalInvoicedKd: '10.0000',
        nested: { unpaidCount: 1 },
      },
      events: [{ id: 'e1', amountKd: '5.0000' }],
    };
    const frozen = deepFreezeCanonical(payload);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.totals)).toBe(true);
    expect(Object.isFrozen(frozen.totals.nested)).toBe(true);
    expect(Object.isFrozen(frozen.events)).toBe(true);
    expect(Object.isFrozen(frozen.events[0])).toBe(true);
  });

  it('blocks mutation attempts on frozen payload', () => {
    const frozen = deepFreezeCanonical({
      totals: { totalInvoicedKd: '10.0000' },
    });
    expect(() => {
      // Strict-mode runtime throws on assignment; in non-strict it silently no-ops,
      // but the value must remain unchanged either way.
      (frozen.totals as { totalInvoicedKd: string }).totalInvoicedKd = '999.0000';
    }).toThrow();
    expect(frozen.totals.totalInvoicedKd).toBe('10.0000');
  });

  it('blocks adding new fields to a frozen payload', () => {
    const frozen = deepFreezeCanonical({ totals: { totalInvoicedKd: '0.0000' } });
    expect(() => {
      (frozen as Record<string, unknown>).extra = 'mutation';
    }).toThrow();
  });

  it('returns the same shape unchanged in production mode', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      jest.resetModules();
      const mod = require('./canonical-immutable') as {
        deepFreezeCanonical: <T>(v: T) => T;
      };
      const payload = { totals: { totalInvoicedKd: '5.0000' } };
      const result = mod.deepFreezeCanonical(payload);
      expect(Object.isFrozen(result)).toBe(false);
      expect(result).toBe(payload);
    } finally {
      process.env.NODE_ENV = original;
      jest.resetModules();
    }
  });
});
