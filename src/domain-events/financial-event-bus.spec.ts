import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { FinancialEventBus } from './financial-event-bus.service';

/**
 * V20.6 — PHASE 4 SPEC.
 *
 * Validates:
 *   1. Deterministic eventId — same business cause = same id
 *   2. Idempotent publish — second publish of same eventId returns alreadyPublished:true, NO duplicate emit
 *   3. Outbox row persisted before emit
 *   4. recordConsumed deduplicates on (eventId, consumerName)
 *   5. Replay re-emits without writing new outbox rows
 *   6. NEVER throws even on persist failure (graceful degradation)
 *   7. markDelivered updates only when null
 */

function makeFakeOutbox() {
  const rows: any[] = [];
  const deliveries: any[] = [];
  return {
    rows,
    deliveries,
    prisma: {
      financialEventOutbox: {
        create: jest.fn(({ data, select }: any) => {
          if (rows.some((r) => r.eventId === data.eventId)) {
            const err = new Prisma.PrismaClientKnownRequestError(
              'unique constraint',
              { code: 'P2002', clientVersion: 'test', meta: {} } as any,
            );
            return Promise.reject(err);
          }
          const row = {
            id: `out-${rows.length + 1}`,
            ...data,
            publishedAt: new Date(),
            deliveredAt: null,
            attempts: 0,
            lastError: null,
          };
          rows.push(row);
          return Promise.resolve(select ? { id: row.id } : row);
        }),
        findMany: jest.fn(({ where, take }: any) => {
          let r = [...rows];
          if (where?.eventName) {
            r = r.filter((x) => x.eventName === where.eventName);
          }
          return Promise.resolve(r.slice(0, take ?? 100));
        }),
        updateMany: jest.fn(({ where, data }: any) => {
          let n = 0;
          for (const r of rows) {
            if (
              r.eventId === where.eventId &&
              (where.deliveredAt === null ? r.deliveredAt === null : true)
            ) {
              Object.assign(r, data);
              n += 1;
            }
          }
          return Promise.resolve({ count: n });
        }),
      },
      financialEventDelivery: {
        create: jest.fn(({ data, select }: any) => {
          if (
            deliveries.some(
              (d) =>
                d.eventId === data.eventId &&
                d.consumerName === data.consumerName,
            )
          ) {
            const err = new Prisma.PrismaClientKnownRequestError(
              'unique constraint',
              { code: 'P2002', clientVersion: 'test', meta: {} } as any,
            );
            return Promise.reject(err);
          }
          const row = {
            id: `del-${deliveries.length + 1}`,
            processedAt: new Date(),
            status: 'OK',
            errorMessage: null,
            ...data,
          };
          deliveries.push(row);
          return Promise.resolve(select ? { id: row.id } : row);
        }),
      },
    } as any,
  };
}

describe('V20.6 — FINANCIAL EVENT BUS', () => {
  it('produces deterministic eventId for same business cause', async () => {
    const fx = makeFakeOutbox();
    const bus = new FinancialEventBus(fx.prisma, new EventEmitter2());
    const occurredAt = '2026-05-07T12:34:56.000Z';
    const a = await bus.publish('finance.payment.captured', {
      customerId: 'cust-1',
      orderId: 'ord-1',
      correlationId: 'pay-1',
      occurredAt,
      amountKd: '12.0000',
      paymentMethod: 'CASH',
    });
    const b = await bus.publish('finance.payment.captured', {
      customerId: 'cust-1',
      orderId: 'ord-1',
      correlationId: 'pay-1',
      // millisecond jitter — must NOT change the id (rounded to seconds)
      occurredAt: '2026-05-07T12:34:56.789Z',
      amountKd: '12.0000',
      paymentMethod: 'CASH',
    });
    expect(a.eventId).toBe(b.eventId);
    expect(a.alreadyPublished).toBe(false);
    expect(b.alreadyPublished).toBe(true); // second publish dedup'd
  });

  it('idempotent publish: second emit is suppressed (no duplicate listener calls)', async () => {
    const fx = makeFakeOutbox();
    const emitter = new EventEmitter2();
    const handler = jest.fn();
    emitter.on('finance.invoice.issued', handler);
    const bus = new FinancialEventBus(fx.prisma, emitter);
    const payload = {
      customerId: 'cust-1',
      orderId: 'ord-1',
      correlationId: 'inv-1',
      occurredAt: '2026-05-07T12:00:00Z',
      invoiceTotalKd: '20.0000',
      posPaymentMethod: 'CASH',
    } as const;
    await bus.publish('finance.invoice.issued', payload);
    await bus.publish('finance.invoice.issued', payload);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(fx.rows).toHaveLength(1);
  });

  it('outbox row persisted with full envelope payload', async () => {
    const fx = makeFakeOutbox();
    const bus = new FinancialEventBus(fx.prisma, new EventEmitter2());
    await bus.publish('finance.fraud.alert.created', {
      customerId: 'cust-1',
      correlationId: 'alert-1',
      occurredAt: '2026-05-07T12:00:00Z',
      alertId: 'fa-1',
      type: 'RAPID_REVERSALS',
      severity: 'HIGH',
    });
    expect(fx.rows).toHaveLength(1);
    expect(fx.rows[0].eventName).toBe('finance.fraud.alert.created');
    expect(fx.rows[0].customerId).toBe('cust-1');
    expect(fx.rows[0].payload.payload.type).toBe('RAPID_REVERSALS');
  });

  it('recordConsumed deduplicates on (eventId, consumerName)', async () => {
    const fx = makeFakeOutbox();
    const bus = new FinancialEventBus(fx.prisma, new EventEmitter2());
    const r1 = await bus.recordConsumed({
      eventId: 'evt-x',
      consumerName: 'snapshot-listener',
    });
    const r2 = await bus.recordConsumed({
      eventId: 'evt-x',
      consumerName: 'snapshot-listener',
    });
    expect(r1.processed).toBe(true);
    expect(r2.processed).toBe(false);
    expect(fx.deliveries).toHaveLength(1);
  });

  it('different consumers can each process the same event', async () => {
    const fx = makeFakeOutbox();
    const bus = new FinancialEventBus(fx.prisma, new EventEmitter2());
    const a = await bus.recordConsumed({
      eventId: 'evt-y',
      consumerName: 'snapshot',
    });
    const b = await bus.recordConsumed({
      eventId: 'evt-y',
      consumerName: 'risk-recompute',
    });
    expect(a.processed).toBe(true);
    expect(b.processed).toBe(true);
    expect(fx.deliveries).toHaveLength(2);
  });

  it('replay re-emits outbox rows without creating new ones', async () => {
    const fx = makeFakeOutbox();
    const emitter = new EventEmitter2();
    const handler = jest.fn();
    emitter.on('finance.payment.captured', handler);
    const bus = new FinancialEventBus(fx.prisma, emitter);
    const payload = {
      customerId: 'cust-1',
      orderId: 'ord-1',
      correlationId: 'pay-1',
      occurredAt: '2026-05-07T12:00:00Z',
      amountKd: '5.0000',
      paymentMethod: 'CASH',
    } as const;
    await bus.publish('finance.payment.captured', payload);
    expect(handler).toHaveBeenCalledTimes(1);

    const replayed = await bus.replay({ name: 'finance.payment.captured' });
    expect(replayed).toBe(1);
    expect(handler).toHaveBeenCalledTimes(2); // original + replay
    expect(fx.rows).toHaveLength(1); // no new outbox row
  });

  it('persist failure does NOT crash publish — bus emits in best-effort mode', async () => {
    const failPrisma = {
      financialEventOutbox: {
        create: jest.fn().mockRejectedValue(new Error('DB outage')),
      },
      financialEventDelivery: { create: jest.fn() },
    } as any;
    const emitter = new EventEmitter2();
    const handler = jest.fn();
    emitter.on('finance.snapshot.refreshed', handler);
    const bus = new FinancialEventBus(failPrisma, emitter);
    const result = await bus.publish('finance.snapshot.refreshed', {
      customerId: 'cust-1',
      occurredAt: '2026-05-07T12:00:00Z',
      refreshSource: 'MANUAL_REBUILD',
    });
    // Outbox failed but the in-process listener still received the event.
    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.eventId).toMatch(/^evt_[a-f0-9]{32}$/);
  });

  it('markDelivered updates only undelivered rows', async () => {
    const fx = makeFakeOutbox();
    const bus = new FinancialEventBus(fx.prisma, new EventEmitter2());
    await bus.publish('finance.payment.captured', {
      customerId: 'cust-1',
      orderId: 'ord-1',
      correlationId: 'pay-2',
      occurredAt: '2026-05-07T12:00:00Z',
      amountKd: '1.0000',
      paymentMethod: 'CASH',
    });
    const eid = fx.rows[0].eventId;
    expect(fx.rows[0].deliveredAt).toBeNull();
    await bus.markDelivered(eid);
    expect(fx.rows[0].deliveredAt).toBeInstanceOf(Date);
    // Calling again is a no-op (no double-mark).
    const before = fx.rows[0].deliveredAt;
    await bus.markDelivered(eid);
    expect(fx.rows[0].deliveredAt).toBe(before);
  });
});
