import { DebtSource } from '../finance/enums/debt-source.enum';
import { computeSubscriptionConsumption } from './subscription-consumption.projection';

/**
 * V20.8.1 — canonical subscription consumption projection contracts.
 *
 *   1. No subscription → all zero
 *   2. Subscription, no orders, no absorption → consumed=0, remaining=value
 *   3. Direct order only (legacy path preserved)
 *   4. Absorption only (the V20.8.1 fix)
 *   5. Mixed direct + absorption
 *   6. Absorption BEFORE activation is excluded
 *   7. Over-consumption clamps remaining to 0 + flags overConsumed
 *   8. Non-PAYMENT ledger rows ignored
 *   9. Non-WALLET sourceRef rows ignored
 *  10. Reproduces CASE #1 from the V20.8.1 brief end-to-end
 */
describe('V20.8.1 — subscription consumption projection', () => {
  const baseActivatedAt = new Date('2026-05-01T10:00:00Z');

  it('1. no subscription → everything zero', () => {
    const r = computeSubscriptionConsumption({
      subscriptionId: null,
      planActualBalanceKd: 0,
      activatedAt: null,
      directOrders: [],
      walletAbsorptionLedger: [],
    });
    expect(r).toEqual({
      directConsumedKd: 0,
      absorbedConsumedKd: 0,
      activationDebtSettledKd: 0,
      consumedKd: 0,
      remainingKd: 0,
      overConsumed: false,
    });
  });

  it('2. subscription with no usage → consumed=0, remaining=value', () => {
    const r = computeSubscriptionConsumption({
      subscriptionId: 'sub-1',
      planActualBalanceKd: 25,
      activatedAt: baseActivatedAt,
      directOrders: [],
      walletAbsorptionLedger: [],
    });
    expect(r.consumedKd).toBe(0);
    expect(r.remainingKd).toBe(25);
  });

  it('3. direct subscription orders (legacy path preserved)', () => {
    const r = computeSubscriptionConsumption({
      subscriptionId: 'sub-1',
      planActualBalanceKd: 25,
      activatedAt: baseActivatedAt,
      directOrders: [
        { id: 'o1', subscriptionId: 'sub-1', amount: 4 },
        { id: 'o2', subscriptionId: 'sub-1', amount: 6 },
      ],
      walletAbsorptionLedger: [],
    });
    expect(r.directConsumedKd).toBe(10);
    expect(r.absorbedConsumedKd).toBe(0);
    expect(r.consumedKd).toBe(10);
    expect(r.remainingKd).toBe(15);
  });

  it('4. wallet-absorption only (the V20.8.1 fix)', () => {
    const r = computeSubscriptionConsumption({
      subscriptionId: 'sub-1',
      planActualBalanceKd: 25,
      activatedAt: baseActivatedAt,
      directOrders: [],
      walletAbsorptionLedger: [
        {
          source: DebtSource.PAYMENT,
          sourceRef: 'PAYMENT:WALLET:order-A:APPLIED',
          amount: 3.25,
          createdAt: new Date('2026-05-02T12:00:00Z'),
        },
      ],
    });
    expect(r.directConsumedKd).toBe(0);
    expect(r.absorbedConsumedKd).toBe(3.25);
    expect(r.consumedKd).toBe(3.25);
    expect(r.remainingKd).toBe(21.75);
  });

  it('5. mixed direct + absorption', () => {
    const r = computeSubscriptionConsumption({
      subscriptionId: 'sub-1',
      planActualBalanceKd: 25,
      activatedAt: baseActivatedAt,
      directOrders: [{ id: 'o1', subscriptionId: 'sub-1', amount: 5 }],
      walletAbsorptionLedger: [
        {
          source: DebtSource.PAYMENT,
          sourceRef: 'PAYMENT:WALLET:order-A:APPLIED',
          amount: 3.25,
          createdAt: new Date('2026-05-02T12:00:00Z'),
        },
        {
          source: DebtSource.PAYMENT,
          sourceRef: 'PAYMENT:WALLET:order-B:APPLIED',
          amount: 2,
          createdAt: new Date('2026-05-03T12:00:00Z'),
        },
      ],
    });
    expect(r.directConsumedKd).toBe(5);
    expect(r.absorbedConsumedKd).toBe(5.25);
    expect(r.consumedKd).toBe(10.25);
    expect(r.remainingKd).toBe(14.75);
  });

  it('6. absorptions BEFORE activation are excluded', () => {
    const r = computeSubscriptionConsumption({
      subscriptionId: 'sub-1',
      planActualBalanceKd: 25,
      activatedAt: baseActivatedAt,
      directOrders: [],
      walletAbsorptionLedger: [
        {
          source: DebtSource.PAYMENT,
          sourceRef: 'PAYMENT:WALLET:old-order:APPLIED',
          amount: 100,
          createdAt: new Date('2026-04-01T00:00:00Z'), // before activation
        },
      ],
    });
    expect(r.absorbedConsumedKd).toBe(0);
    expect(r.consumedKd).toBe(0);
    expect(r.remainingKd).toBe(25);
  });

  it('7. over-consumption clamps remaining to 0 and sets overConsumed', () => {
    const r = computeSubscriptionConsumption({
      subscriptionId: 'sub-1',
      planActualBalanceKd: 10,
      activatedAt: baseActivatedAt,
      directOrders: [{ id: 'o1', subscriptionId: 'sub-1', amount: 7 }],
      walletAbsorptionLedger: [
        {
          source: DebtSource.PAYMENT,
          sourceRef: 'PAYMENT:WALLET:order-A:APPLIED',
          amount: 5,
          createdAt: new Date('2026-05-02T12:00:00Z'),
        },
      ],
    });
    expect(r.consumedKd).toBe(12);
    expect(r.remainingKd).toBe(0);
    expect(r.overConsumed).toBe(true);
  });

  it('8. non-PAYMENT ledger rows are ignored (e.g. INVOICE_SHORTFALL)', () => {
    const r = computeSubscriptionConsumption({
      subscriptionId: 'sub-1',
      planActualBalanceKd: 25,
      activatedAt: baseActivatedAt,
      directOrders: [],
      walletAbsorptionLedger: [
        {
          source: DebtSource.INVOICE_SHORTFALL,
          sourceRef: 'PAYMENT:WALLET:order-A:APPLIED',
          amount: 99,
          createdAt: new Date('2026-05-02T12:00:00Z'),
        },
      ],
    });
    expect(r.absorbedConsumedKd).toBe(0);
  });

  it('9. PAYMENT rows with non-WALLET sourceRef are ignored (real payments)', () => {
    const r = computeSubscriptionConsumption({
      subscriptionId: 'sub-1',
      planActualBalanceKd: 25,
      activatedAt: baseActivatedAt,
      directOrders: [],
      walletAbsorptionLedger: [
        {
          source: DebtSource.PAYMENT,
          sourceRef: 'PAYMENT:CASH:txn-99',
          amount: 999,
          createdAt: new Date('2026-05-02T12:00:00Z'),
        },
      ],
    });
    expect(r.absorbedConsumedKd).toBe(0);
  });

  it('10. CASE #1 reproduction — 25 KD subscription absorbs 3.25 KD invoice', () => {
    // Before: customer had 3.25 unpaid invoice, then 25 KD subscription
    // activated, then 3.25 absorbed. Pre-V20.8.1 reported consumed=0.
    const r = computeSubscriptionConsumption({
      subscriptionId: 'sub-case-1',
      planActualBalanceKd: 25,
      activatedAt: baseActivatedAt,
      directOrders: [],
      walletAbsorptionLedger: [
        {
          source: DebtSource.PAYMENT,
          sourceRef: 'PAYMENT:WALLET:invoice-3-25:APPLIED',
          amount: 3.25,
          createdAt: new Date('2026-05-02T08:30:00Z'),
        },
      ],
    });
    expect(r.consumedKd).toBe(3.25);
    expect(r.remainingKd).toBe(21.75);
    expect(r.overConsumed).toBe(false);
  });

  it('11. conversion: subscription activation debt settlement consumes the plan credit', () => {
    const r = computeSubscriptionConsumption({
      subscriptionId: 'sub-convert',
      planActualBalanceKd: 25,
      activatedAt: baseActivatedAt,
      directOrders: [],
      walletAbsorptionLedger: [],
      activationDebtSettlements: [
        {
          id: 'activation-row',
          subscriptionId: 'sub-convert',
          amount: 25,
          createdAt: new Date('2026-05-02T08:30:00Z'),
        },
      ],
    });

    expect(r.activationDebtSettledKd).toBe(25);
    expect(r.consumedKd).toBe(25);
    expect(r.remainingKd).toBe(0);
    expect(r.overConsumed).toBe(false);
  });
});
