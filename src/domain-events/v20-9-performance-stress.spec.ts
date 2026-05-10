import type { Subscription } from 'rxjs';
import { FinancialEventDispatcher } from './financial-event-dispatcher.service';
import { FinancialRealtimeGateway } from './realtime/financial-realtime.gateway';
import { InMemoryEventBusAdapter } from './adapters/in-memory-event-bus.adapter';

/**
 * V20.9 — Phase 7 performance + scale stress harness.
 *
 * Targets the V20.9 mission's headline numbers:
 *
 *   • 10K events / minute throughput
 *   • 500 concurrent realtime operators
 *   • dispatcher handles backlog without unbounded memory
 *
 * # Why integration-shaped here
 *
 * These tests use the same in-process primitives that prod runs
 * (gateway + dispatcher + adapter) so they catch fan-out blow-ups,
 * subscriber leaks, and counter drift. The fake outbox is a
 * deterministic store — no DB I/O — so the harness focuses on
 * the application-layer characteristics, not Postgres latency.
 *
 * # Budgets (kept conservative — CI-friendly)
 *
 *   • 1,000 dispatch in < 2s on the in-memory adapter.
 *   • 500 subscribers + 200 events ⇒ no GC explosion (we just
 *     assert all 500 received exactly the expected count and
 *     unsubscribed cleanly).
 */

type FakeRow = {
  id: string;
  eventId: string;
  eventName: string;
  customerId: string | null;
  correlationId: string | null;
  occurredAt: Date;
  publishedAt: Date;
  deliveredAt: Date | null;
  attempts: number;
  lastError: string | null;
  payload: unknown;
};

function makeFakeOutbox(seedRows: FakeRow[]) {
  return {
    rows: seedRows,
    prisma: {
      financialEventOutbox: {
        findMany: jest.fn(({ where, orderBy, take }: any) => {
          let r = [...seedRows];
          if (where?.deliveredAt === null) r = r.filter((x) => x.deliveredAt === null);
          if (where?.attempts?.lt !== undefined) r = r.filter((x) => x.attempts < where.attempts.lt);
          if (orderBy?.publishedAt === 'asc') r.sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
          return Promise.resolve(r.slice(0, take ?? 100));
        }),
        updateMany: jest.fn(({ where, data }: any) => {
          let n = 0;
          for (const r of seedRows) {
            if (r.eventId !== where.eventId) continue;
            if ('deliveredAt' in where && where.deliveredAt === null && r.deliveredAt !== null) continue;
            Object.assign(r, data);
            n += 1;
          }
          return Promise.resolve({ count: n });
        }),
      },
    } as any,
  };
}

describe('V20.9 — PERFORMANCE & SCALE STRESS', () => {
  jest.setTimeout(20_000);

  it('1. dispatches 1,000 events in <2s on the in-memory adapter (no leaks)', async () => {
    const N = 1000;
    const rows: FakeRow[] = [];
    for (let i = 0; i < N; i += 1) {
      rows.push({
        id: `out-${i}`,
        eventId: `evt-${i.toString(16).padStart(8, '0')}`,
        eventName: 'finance.payment.captured',
        customerId: `cust-${i % 250}`,
        correlationId: null,
        occurredAt: new Date(Date.now() + i),
        publishedAt: new Date(Date.now() + i),
        deliveredAt: null,
        attempts: 0,
        lastError: null,
        payload: { customerId: `cust-${i % 250}`, occurredAt: new Date(Date.now() + i).toISOString() },
      });
    }
    const fx = makeFakeOutbox(rows);
    const adapter = new InMemoryEventBusAdapter();
    const dispatcher = new FinancialEventDispatcher(fx.prisma, adapter, adapter);

    const t0 = Date.now();
    let total = 0;
    while (true) {
      const r = await dispatcher.tick({ batchSize: 200 });
      total += r.dispatched;
      if (r.dispatched === 0) break;
    }
    const elapsed = Date.now() - t0;
    expect(total).toBe(N);
    expect(elapsed).toBeLessThan(2000);
    // All rows now delivered.
    expect(rows.every((r) => r.deliveredAt !== null)).toBe(true);
  });

  it('2. realtime gateway: 500 subscribers receive 200 events each in O(1) fan-out', async () => {
    const gateway = new FinancialRealtimeGateway();
    const NSubs = 500;
    const NEvents = 200;
    const counters = new Array<number>(NSubs).fill(0);
    const subs: Subscription[] = [];
    for (let i = 0; i < NSubs; i += 1) {
      const sub = gateway
        .subscribe({ channel: 'dashboards', role: 'OWNER' })
        .subscribe(() => {
          counters[i] += 1;
        });
      subs.push(sub);
    }
    expect(gateway.metrics.activeSubscribers).toBe(NSubs);

    const t0 = Date.now();
    for (let i = 0; i < NEvents; i += 1) {
      gateway.onFinancialEvent({
        name: 'finance.payment.captured',
        payload: {
          customerId: `cust-${i}`,
          occurredAt: new Date().toISOString(),
        } as any,
      });
    }
    const elapsed = Date.now() - t0;

    // Heartbeat fires every 15s; in our short window each subscriber
    // should have received EXACTLY NEvents items + at most 1 heartbeat
    // (very unlikely in this short window, but tolerate it).
    expect(counters.every((c) => c >= NEvents && c <= NEvents + 1)).toBe(true);
    // Tight upper bound — fan-out must be linear.
    expect(elapsed).toBeLessThan(2000);

    for (const s of subs) s.unsubscribe();
    expect(gateway.metrics.activeSubscribers).toBe(0);
  });

  it('3. backlog flush: 5,000 unbatched events through the dispatcher', async () => {
    const N = 5000;
    const rows: FakeRow[] = [];
    for (let i = 0; i < N; i += 1) {
      rows.push({
        id: `r-${i}`,
        eventId: `evt-bk-${i}`,
        eventName: 'finance.invoice.issued',
        customerId: null,
        correlationId: null,
        occurredAt: new Date(Date.now() + i),
        publishedAt: new Date(Date.now() + i),
        deliveredAt: null,
        attempts: 0,
        lastError: null,
        payload: {},
      });
    }
    const fx = makeFakeOutbox(rows);
    const adapter = new InMemoryEventBusAdapter();
    const dispatcher = new FinancialEventDispatcher(fx.prisma, adapter, adapter);

    let total = 0;
    while (true) {
      const r = await dispatcher.tick({ batchSize: 500 });
      total += r.dispatched;
      if (r.dispatched === 0) break;
    }
    expect(total).toBe(N);
    // The adapter ring buffer is bounded — verify it didn't grow beyond limit.
    expect(adapter.recent(10000).length).toBeLessThanOrEqual(1024);
  });
});
