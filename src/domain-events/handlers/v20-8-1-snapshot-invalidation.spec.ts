import { FinancialSnapshotListener } from './financial-snapshot.listener';

/**
 * V20.8.1 — Phase 6 cache-invalidation pin tests.
 *
 * These pin the Customer 360 / financial snapshot refresh contract:
 * after ANY mutation that changes the canonical state, the listener
 * must dispatch a snapshot refresh for the affected customer. A
 * regression here re-introduces the "stale balance after settlement"
 * bug from the V20.8.1 brief.
 *
 *   1. `finance.wallet.absorbed`     → refresh with WALLET_ABSORBED
 *   2. `finance.payment.partial`     → refresh with PARTIAL_PAYMENT_RECORDED
 *   3. `finance.payment.captured`    → refresh with PAYMENT_CAPTURED
 *   4. `finance.subscription.activated` → refresh with SUBSCRIPTION_ACTIVATED
 *   5. `finance.snapshot.refreshed`  → INTENTIONALLY skipped (avoid loop)
 *   6. Realtime refresher takes precedence when registered
 *   7. Legacy direct path still works when refresher is absent
 *   8. Listener never throws (refresh failures swallowed)
 */
describe('V20.8.1 — financial snapshot invalidation (Phase 6 pins)', () => {
  function makeSnapshots() {
    return {
      refreshOneInBackground: jest.fn().mockResolvedValue(undefined),
    };
  }
  function makeRefresher() {
    return { request: jest.fn() };
  }

  it('1. wallet.absorbed → refresh with WALLET_ABSORBED', () => {
    const snapshots = makeSnapshots();
    const refresher = makeRefresher();
    const listener = new FinancialSnapshotListener(snapshots as any, refresher as any);
    listener.handle({
      name: 'finance.wallet.absorbed',
      payload: {
        customerId: 'cust-1',
        orderId: 'ord-1',
        correlationId: 'corr-1',
        occurredAt: new Date().toISOString(),
        amountKd: '3.2500',
      } as any,
    });
    expect(refresher.request).toHaveBeenCalledWith(
      'cust-1',
      'WALLET_ABSORBED',
      'corr-1',
    );
  });

  it('2. payment.partial → refresh with PARTIAL_PAYMENT_RECORDED', () => {
    const refresher = makeRefresher();
    const listener = new FinancialSnapshotListener(makeSnapshots() as any, refresher as any);
    listener.handle({
      name: 'finance.payment.partial',
      payload: {
        customerId: 'cust-2',
        orderId: 'ord-2',
        correlationId: 'corr-2',
        occurredAt: new Date().toISOString(),
        amountKd: '4.0000',
        paymentMethod: 'CASH',
      } as any,
    });
    expect(refresher.request).toHaveBeenCalledWith(
      'cust-2',
      'PARTIAL_PAYMENT_RECORDED',
      'corr-2',
    );
  });

  it('3. payment.captured → refresh with PAYMENT_CAPTURED', () => {
    const refresher = makeRefresher();
    const listener = new FinancialSnapshotListener(makeSnapshots() as any, refresher as any);
    listener.handle({
      name: 'finance.payment.captured',
      payload: {
        customerId: 'cust-3',
        orderId: 'ord-3',
        correlationId: 'corr-3',
        occurredAt: new Date().toISOString(),
        amountKd: '10.0000',
        paymentMethod: 'KNET',
      } as any,
    });
    expect(refresher.request).toHaveBeenCalledWith(
      'cust-3',
      'PAYMENT_CAPTURED',
      'corr-3',
    );
  });

  it('4. subscription.activated → refresh with SUBSCRIPTION_ACTIVATED', () => {
    const refresher = makeRefresher();
    const listener = new FinancialSnapshotListener(makeSnapshots() as any, refresher as any);
    listener.handle({
      name: 'finance.subscription.activated',
      payload: {
        customerId: 'cust-4',
        correlationId: 'corr-4',
        occurredAt: new Date().toISOString(),
        planId: 'plan-A',
        expiresAt: new Date().toISOString(),
      } as any,
    });
    expect(refresher.request).toHaveBeenCalledWith(
      'cust-4',
      'SUBSCRIPTION_ACTIVATED',
      'corr-4',
    );
  });

  it('5. snapshot.refreshed is ignored (avoids self-feedback loop)', () => {
    const refresher = makeRefresher();
    const listener = new FinancialSnapshotListener(makeSnapshots() as any, refresher as any);
    listener.handle({
      name: 'finance.snapshot.refreshed',
      payload: {
        customerId: 'cust-5',
        occurredAt: new Date().toISOString(),
        refreshSource: 'WALLET_ABSORBED',
      } as any,
    });
    expect(refresher.request).not.toHaveBeenCalled();
  });

  it('6. realtime refresher takes precedence when registered', () => {
    const snapshots = makeSnapshots();
    const refresher = makeRefresher();
    const listener = new FinancialSnapshotListener(snapshots as any, refresher as any);
    listener.handle({
      name: 'finance.wallet.absorbed',
      payload: {
        customerId: 'cust-6',
        correlationId: null,
        occurredAt: new Date().toISOString(),
        amountKd: '1.0000',
      } as any,
    });
    expect(refresher.request).toHaveBeenCalledTimes(1);
    expect(snapshots.refreshOneInBackground).not.toHaveBeenCalled();
  });

  it('7. legacy direct path works when refresher is absent', () => {
    const snapshots = makeSnapshots();
    const listener = new FinancialSnapshotListener(snapshots as any, null);
    listener.handle({
      name: 'finance.wallet.absorbed',
      payload: {
        customerId: 'cust-7',
        correlationId: null,
        occurredAt: new Date().toISOString(),
        amountKd: '1.0000',
      } as any,
    });
    expect(snapshots.refreshOneInBackground).toHaveBeenCalledWith(
      'cust-7',
      'WALLET_ABSORBED',
      null,
    );
  });

  it('8. listener never throws even when refresh fails', () => {
    const broken = {
      request: () => {
        throw new Error('downstream broken');
      },
    };
    const listener = new FinancialSnapshotListener(makeSnapshots() as any, broken as any);
    expect(() =>
      listener.handle({
        name: 'finance.wallet.absorbed',
        payload: {
          customerId: 'cust-8',
          correlationId: null,
          occurredAt: new Date().toISOString(),
          amountKd: '1.0000',
        } as any,
      }),
    ).not.toThrow();
  });

  it('9. event without customerId is ignored (defensive)', () => {
    const refresher = makeRefresher();
    const listener = new FinancialSnapshotListener(makeSnapshots() as any, refresher as any);
    listener.handle({
      name: 'finance.payment.captured',
      payload: { occurredAt: new Date().toISOString() } as any,
    });
    expect(refresher.request).not.toHaveBeenCalled();
  });
});
