import { FinancialEventDispatcher } from './financial-event-dispatcher.service';
import { InMemoryEventBusAdapter } from './adapters/in-memory-event-bus.adapter';

/**
 * V20.9 — Phase 1 dispatcher contracts.
 *
 * Locks down the six required behaviours:
 *
 *   1. Ordered delivery — pulls rows in `publishedAt ASC`.
 *   2. Replay safety — a row that is already `deliveredAt != null`
 *      is NEVER re-dispatched on the next tick.
 *   3. Duplicate delivery to the broker is benign — same envelope
 *      can ship twice; the consumer dedups via `recordConsumed`.
 *   4. Dispatcher restart resumes from `deliveredAt IS NULL`; no
 *      in-process state.
 *   5. Concurrent `tick()` calls short-circuit (only ONE worker).
 *   6. Adapter failures bump `attempts` + `lastError`; after
 *      `maxAttempts` the row is moved to DLQ (logged at ERROR).
 */

type FakeOutboxRow = {
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

function makeFakeOutboxStore() {
  const rows: FakeOutboxRow[] = [];
  const seed = (ev: Partial<FakeOutboxRow> & { eventId: string; eventName: string; publishedAt: Date }) => {
    rows.push({
      id: `out-${rows.length + 1}`,
      eventId: ev.eventId,
      eventName: ev.eventName,
      customerId: ev.customerId ?? null,
      correlationId: ev.correlationId ?? null,
      occurredAt: ev.occurredAt ?? ev.publishedAt,
      publishedAt: ev.publishedAt,
      deliveredAt: ev.deliveredAt ?? null,
      attempts: ev.attempts ?? 0,
      lastError: ev.lastError ?? null,
      payload: ev.payload ?? { name: ev.eventName, payload: {} },
    });
  };

  const prisma = {
    financialEventOutbox: {
      findMany: jest.fn(({ where, orderBy, take }: any) => {
        let r = [...rows];
        if (where?.deliveredAt === null) r = r.filter((x) => x.deliveredAt === null);
        if (where?.deliveredAt?.not !== undefined && where.deliveredAt.not === null) {
          r = r.filter((x) => x.deliveredAt !== null);
          if (where.deliveredAt.gte) {
            const gte = where.deliveredAt.gte as Date;
            r = r.filter((x) => x.deliveredAt && x.deliveredAt >= gte);
          }
          if (where.deliveredAt.lte) {
            const lte = where.deliveredAt.lte as Date;
            r = r.filter((x) => x.deliveredAt && x.deliveredAt <= lte);
          }
        }
        if (where?.attempts?.lt !== undefined) {
          r = r.filter((x) => x.attempts < where.attempts.lt);
        }
        if (orderBy?.publishedAt === 'asc') {
          r.sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
        }
        return Promise.resolve(r.slice(0, take ?? 100));
      }),
      updateMany: jest.fn(({ where, data }: any) => {
        let n = 0;
        for (const r of rows) {
          if (r.eventId !== where.eventId) continue;
          if ('deliveredAt' in where && where.deliveredAt === null && r.deliveredAt !== null) continue;
          Object.assign(r, data);
          n += 1;
        }
        return Promise.resolve({ count: n });
      }),
    },
  } as any;

  return { rows, seed, prisma };
}

describe('V20.9 — FINANCIAL EVENT DISPATCHER', () => {
  it('1. ordered delivery — rows shipped in publishedAt ASC', async () => {
    const fx = makeFakeOutboxStore();
    const adapter = new InMemoryEventBusAdapter();
    const d = new FinancialEventDispatcher(fx.prisma, adapter, adapter);
    const t0 = new Date('2026-05-07T12:00:00Z');
    fx.seed({ eventId: 'e3', eventName: 'finance.payment.captured', publishedAt: new Date(t0.getTime() + 30) });
    fx.seed({ eventId: 'e1', eventName: 'finance.invoice.issued',  publishedAt: new Date(t0.getTime() + 10) });
    fx.seed({ eventId: 'e2', eventName: 'finance.payment.partial', publishedAt: new Date(t0.getTime() + 20) });

    const r = await d.tick();
    expect(r.dispatched).toBe(3);
    expect(adapter.recent().map((e) => e.eventId)).toEqual(['e1', 'e2', 'e3']);
  });

  it('2. replay safety — already-delivered rows are NEVER re-shipped', async () => {
    const fx = makeFakeOutboxStore();
    const adapter = new InMemoryEventBusAdapter();
    const d = new FinancialEventDispatcher(fx.prisma, adapter, adapter);
    fx.seed({ eventId: 'e1', eventName: 'finance.payment.captured', publishedAt: new Date(), deliveredAt: new Date() });
    fx.seed({ eventId: 'e2', eventName: 'finance.payment.captured', publishedAt: new Date() });

    const r = await d.tick();
    expect(r.dispatched).toBe(1);
    expect(adapter.recent().map((e) => e.eventId)).toEqual(['e2']);
  });

  it('3. duplicate broker delivery is benign (consumer dedups elsewhere)', async () => {
    const fx = makeFakeOutboxStore();
    const adapter = new InMemoryEventBusAdapter();
    const d = new FinancialEventDispatcher(fx.prisma, adapter, adapter);
    fx.seed({ eventId: 'e1', eventName: 'finance.payment.captured', publishedAt: new Date() });

    await d.tick();
    // Replay the SAME deliveredAt window → adapter sees the envelope twice;
    // it does NOT throw or reject. The consumer-side dedup (recordConsumed)
    // is what makes this safe end-to-end.
    const replayed = await d.replayDelivered({ since: new Date(Date.now() - 60000) });
    expect(replayed).toBe(1);
    expect(adapter.recent()).toHaveLength(2);
  });

  it('4. dispatcher restart resumes from deliveredAt IS NULL', async () => {
    const fx = makeFakeOutboxStore();
    const adapter1 = new InMemoryEventBusAdapter();
    const d1 = new FinancialEventDispatcher(fx.prisma, adapter1, adapter1);
    fx.seed({ eventId: 'e1', eventName: 'finance.payment.captured', publishedAt: new Date() });
    fx.seed({ eventId: 'e2', eventName: 'finance.payment.captured', publishedAt: new Date(Date.now() + 1) });

    // Dispatcher #1 ships e1 only (simulate failure by injecting fail-next on adapter for e2).
    adapter1.__failNext(0);
    await d1.tick({ batchSize: 1 });
    expect(adapter1.recent().map((e) => e.eventId)).toEqual(['e1']);

    // "Restart" — fresh dispatcher, fresh adapter — resumes from db state.
    const adapter2 = new InMemoryEventBusAdapter();
    const d2 = new FinancialEventDispatcher(fx.prisma, adapter2, adapter2);
    await d2.tick();
    expect(adapter2.recent().map((e) => e.eventId)).toEqual(['e2']);
  });

  it('5. concurrent tick() calls short-circuit — only ONE worker progresses', async () => {
    const fx = makeFakeOutboxStore();
    const adapter = new InMemoryEventBusAdapter();
    const d = new FinancialEventDispatcher(fx.prisma, adapter, adapter);
    for (let i = 0; i < 10; i += 1) {
      fx.seed({ eventId: `e${i}`, eventName: 'finance.payment.captured', publishedAt: new Date(Date.now() + i) });
    }
    const [r1, r2, r3] = await Promise.all([d.tick(), d.tick(), d.tick()]);
    const totalDispatched = r1.dispatched + r2.dispatched + r3.dispatched;
    expect(totalDispatched).toBe(10); // all rows shipped exactly once
    expect([r1.skippedReason, r2.skippedReason, r3.skippedReason].filter((x) => x === 'busy').length).toBeGreaterThanOrEqual(2);
  });

  it('6. adapter failures bump attempts; after maxAttempts the row goes DLQ', async () => {
    const fx = makeFakeOutboxStore();
    const adapter = new InMemoryEventBusAdapter();
    const d = new FinancialEventDispatcher(fx.prisma, adapter, adapter);
    fx.seed({ eventId: 'e-bad', eventName: 'finance.payment.captured', publishedAt: new Date() });

    // Force every dispatch to fail.
    adapter.__failNext(99);

    // 16 ticks (= maxAttempts in dispatcher) — last one should DLQ the row.
    let totalDeadLetter = 0;
    for (let i = 0; i < 16; i += 1) {
      const r = await d.tick();
      totalDeadLetter += r.deadLetter;
    }
    expect(fx.rows[0].attempts).toBe(16);
    expect(fx.rows[0].lastError).toMatch(/simulated broker failure/);
    expect(totalDeadLetter).toBe(1);

    // After DLQ, further ticks NEVER pick this row up again
    // (the WHERE filter excludes attempts >= maxAttempts).
    adapter.__failNext(0);
    const r = await d.tick();
    expect(r.dispatched).toBe(0);
  });

  it('7. unhealthy adapter pauses dispatch (no rows lost)', async () => {
    const fx = makeFakeOutboxStore();
    const sickAdapter: InMemoryEventBusAdapter = new InMemoryEventBusAdapter();
    sickAdapter.healthCheck = jest.fn().mockResolvedValue(false) as any;
    const d = new FinancialEventDispatcher(fx.prisma, sickAdapter, sickAdapter);
    fx.seed({ eventId: 'e1', eventName: 'finance.payment.captured', publishedAt: new Date() });

    const r = await d.tick();
    expect(r.skippedReason).toBe('unhealthy');
    expect(r.dispatched).toBe(0);
    expect(fx.rows[0].deliveredAt).toBeNull(); // still queued
  });
});
