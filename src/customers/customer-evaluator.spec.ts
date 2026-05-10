import { buildInsight, evaluateCustomer } from './customer-evaluator';

describe('customer evaluator', () => {
  it('returns BLOCKED when customer is manually blocked', () => {
    expect(
      evaluateCustomer({
        consumedKd: '0.0000',
        subscriptionValueKd: '0.0000',
        canonicalDebtKd: '0.0000',
        isBlocked: true,
      }),
    ).toBe('BLOCKED');
  });

  it('returns BLOCKED for high debt or heavy overuse', () => {
    expect(
      evaluateCustomer({
        consumedKd: '0.0000',
        subscriptionValueKd: '0.0000',
        canonicalDebtKd: '500.0100',
      }),
    ).toBe('BLOCKED');

    expect(
      evaluateCustomer({
        consumedKd: '1200.0000',
        subscriptionValueKd: '999.9900',
        canonicalDebtKd: '0.0000',
      }),
    ).toBe('BLOCKED');
  });

  it('returns WATCH for moderate debt or overuse and GOOD otherwise', () => {
    expect(
      evaluateCustomer({
        consumedKd: '0.0000',
        subscriptionValueKd: '0.0000',
        canonicalDebtKd: '50.0100',
      }),
    ).toBe('WATCH');

    expect(
      evaluateCustomer({
        consumedKd: '70.1000',
        subscriptionValueKd: '50.0000',
        canonicalDebtKd: '0.0000',
      }),
    ).toBe('WATCH');

    expect(
      evaluateCustomer({
        consumedKd: '20.0000',
        subscriptionValueKd: '100.0000',
        canonicalDebtKd: '0.0000',
      }),
    ).toBe('GOOD');
  });

  it('builds Arabic insight text for each rating', () => {
    const fin = {
      consumedKd: '0.0000',
      subscriptionValueKd: '0.0000',
      canonicalDebtKd: '0.0000',
    };
    expect(buildInsight(fin, 'BLOCKED')).toContain('العميل موقوف');
    expect(buildInsight(fin, 'WATCH')).toContain('يحتاج متابعة');
    expect(buildInsight(fin, 'GOOD')).toContain('العميل ملتزم');
  });
});
