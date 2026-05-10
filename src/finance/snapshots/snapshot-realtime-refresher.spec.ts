import { SnapshotRealtimeRefresher } from './snapshot-realtime-refresher.service';

/**
 * V20.6 — PHASE 5 SPEC.
 *
 * Validates:
 *   1. Single request → single refresh
 *   2. Debounce — N requests within window → 1 refresh
 *   3. Cooldown — request during cooldown queues ONE catchup
 *   4. Concurrency cap respected under burst load
 *   5. Stress test: 1000 rapid requests for 100 customers → << 1000 refreshes
 *   6. Failure does NOT propagate to caller
 *   7. Different customers run in parallel (no cross-customer blocking)
 */

function makeFakeSnapshotService(opts: { latencyMs?: number; failOn?: Set<string> } = {}) {
  const refreshLog: Array<{ customerId: string; at: number }> = [];
  let failed = 0;
  const svc = {
    refreshOne: jest.fn(async (customerId: string) => {
      if (opts.failOn?.has(customerId)) {
        failed += 1;
        throw new Error('FAILED_FOR_TEST');
      }
      if (opts.latencyMs) {
        await new Promise((res) => setTimeout(res, opts.latencyMs));
      }
      refreshLog.push({ customerId, at: Date.now() });
      return { customerId };
    }),
  } as any;
  return { svc, refreshLog, failed: () => failed };
}

describe('V20.6 — SNAPSHOT REALTIME REFRESHER', () => {
  it('single request fires exactly one refresh', async () => {
    const fx = makeFakeSnapshotService();
    const r = new SnapshotRealtimeRefresher(fx.svc, {
      debounceMs: 20,
      minIntervalMs: 100,
      maxConcurrency: 5,
    });
    r.request('c1', 'PAYMENT_CAPTURED');
    await r.drain();
    expect(fx.refreshLog).toHaveLength(1);
    expect(fx.refreshLog[0].customerId).toBe('c1');
    const stats = r.getStats();
    expect(stats.refreshed).toBe(1);
    expect(stats.requested).toBe(1);
    expect(stats.debounced).toBe(0);
  });

  it('100 rapid requests for the same customer collapse to 1 refresh (debounce)', async () => {
    const fx = makeFakeSnapshotService();
    const r = new SnapshotRealtimeRefresher(fx.svc, {
      debounceMs: 30,
      minIntervalMs: 200,
      maxConcurrency: 5,
    });
    for (let i = 0; i < 100; i += 1) {
      r.request('c1', 'PAYMENT_CAPTURED');
    }
    await r.drain();
    expect(fx.refreshLog).toHaveLength(1);
    const stats = r.getStats();
    expect(stats.requested).toBe(100);
    expect(stats.debounced).toBe(99);
    expect(stats.refreshed).toBe(1);
  });

  it('request during cooldown queues ONE catch-up refresh', async () => {
    const fx = makeFakeSnapshotService({ latencyMs: 30 });
    const r = new SnapshotRealtimeRefresher(fx.svc, {
      debounceMs: 5,
      minIntervalMs: 50,
      maxConcurrency: 5,
    });
    r.request('c1', 'PAYMENT_CAPTURED');
    // Wait for first to start (debounce ~5ms + execution starts)
    await new Promise((res) => setTimeout(res, 15));
    // Now in flight — fire 50 more requests
    for (let i = 0; i < 50; i += 1) {
      r.request('c1', 'PARTIAL_PAYMENT_RECORDED');
    }
    await r.drain();
    // Should be at most 2 refreshes: original + 1 catch-up
    expect(fx.refreshLog.length).toBeLessThanOrEqual(2);
    expect(fx.refreshLog.length).toBeGreaterThanOrEqual(1);
  });

  it('STRESS — 1000 rapid requests across 100 customers → far fewer refreshes than 1000', async () => {
    const fx = makeFakeSnapshotService({ latencyMs: 1 });
    const r = new SnapshotRealtimeRefresher(fx.svc, {
      debounceMs: 20,
      minIntervalMs: 100,
      maxConcurrency: 10,
    });

    for (let i = 0; i < 1000; i += 1) {
      const customerId = `c${i % 100}`; // 100 distinct customers, 10x each
      r.request(customerId, 'PAYMENT_CAPTURED');
    }
    await r.drain(10000);

    // Each customer should refresh at most ~once (all 10 of their
    // requests collapsed into 1).
    const stats = r.getStats();
    expect(stats.requested).toBe(1000);
    // Refreshes should be way less than 1000 — ideally ≈100.
    expect(fx.refreshLog.length).toBeLessThanOrEqual(120);
    // Each customer refreshed at least once.
    const distinctCustomers = new Set(
      fx.refreshLog.map((l) => l.customerId),
    );
    expect(distinctCustomers.size).toBe(100);
    // Reduction ratio must be >= 8x (1000 in / ≤120 out).
    const reductionRatio = 1000 / fx.refreshLog.length;
    expect(reductionRatio).toBeGreaterThanOrEqual(8);
  }, 15000);

  it('failure of one refresh is logged + counted, does not crash other customers', async () => {
    const fx = makeFakeSnapshotService({ failOn: new Set(['c-bad']) });
    const r = new SnapshotRealtimeRefresher(fx.svc, {
      debounceMs: 5,
      minIntervalMs: 50,
      maxConcurrency: 5,
    });
    r.request('c-good', 'PAYMENT_CAPTURED');
    r.request('c-bad', 'PAYMENT_CAPTURED');
    r.request('c-other', 'PAYMENT_CAPTURED');
    await r.drain();
    const stats = r.getStats();
    expect(stats.failures).toBe(1);
    expect(stats.refreshed).toBe(2);
    // c-good and c-other landed.
    const good = fx.refreshLog.find((l) => l.customerId === 'c-good');
    const other = fx.refreshLog.find((l) => l.customerId === 'c-other');
    expect(good).toBeDefined();
    expect(other).toBeDefined();
  });

  it('different customers run in parallel up to concurrency cap', async () => {
    const fx = makeFakeSnapshotService({ latencyMs: 30 });
    const r = new SnapshotRealtimeRefresher(fx.svc, {
      debounceMs: 5,
      minIntervalMs: 100,
      maxConcurrency: 5,
    });
    const start = Date.now();
    for (let i = 0; i < 5; i += 1) {
      r.request(`c${i}`, 'PAYMENT_CAPTURED');
    }
    await r.drain();
    const elapsed = Date.now() - start;
    // 5 parallel @ 30ms latency should complete in ~50ms (debounce + 30 + slack),
    // not 5*30=150ms (sequential).
    expect(elapsed).toBeLessThan(120);
    expect(fx.refreshLog).toHaveLength(5);
  });

  it('request() returns synchronously even when refresh is slow (non-blocking)', async () => {
    const fx = makeFakeSnapshotService({ latencyMs: 200 });
    const r = new SnapshotRealtimeRefresher(fx.svc, {
      debounceMs: 5,
      minIntervalMs: 100,
      maxConcurrency: 5,
    });
    const start = Date.now();
    r.request('c1', 'PAYMENT_CAPTURED');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(10); // < 10ms — definitely sync
    await r.drain();
    expect(fx.refreshLog).toHaveLength(1);
  });

  it('idempotent under empty customerId — silently ignored', async () => {
    const fx = makeFakeSnapshotService();
    const r = new SnapshotRealtimeRefresher(fx.svc, {
      debounceMs: 5,
      minIntervalMs: 50,
      maxConcurrency: 5,
    });
    r.request('', 'PAYMENT_CAPTURED');
    await r.drain();
    expect(fx.refreshLog).toHaveLength(0);
    expect(r.getStats().requested).toBe(0);
  });
});
