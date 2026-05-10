/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, PromiseToPayStatus } from '@prisma/client';
import { PromisesToPayService } from './promises.service';

/**
 * V20.5 — Phase 2 Promise-to-Pay tests.
 *
 * Mocked-Prisma test bench. Verifies the state machine, idempotency
 * key short-circuit, BadRequest on past dates / non-positive amounts,
 * conditional UPDATE concurrency safety, and the auto-broken cron's
 * grace-window logic.
 */

function makeStore() {
  const promises = new Map<string, any>();
  const events: any[] = [];
  let promiseAutoId = 0;

  const tx = {
    promiseToPay: {
      findUnique: jest.fn(({ where }: any) => {
        if (where.id) return Promise.resolve(promises.get(where.id) ?? null);
        if (where.idempotencyKey !== undefined) {
          for (const v of promises.values()) {
            if (v.idempotencyKey === where.idempotencyKey) {
              return Promise.resolve(v);
            }
          }
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      }),
      findMany: jest.fn(({ where, take }: any = {}) => {
        const out: any[] = [];
        for (const v of promises.values()) {
          if (where?.status && v.status !== where.status) continue;
          if (where?.promisedDate?.lt && v.promisedDate >= where.promisedDate.lt) continue;
          out.push(v);
          if (take && out.length >= take) break;
        }
        return Promise.resolve(out.map((p) => ({ id: p.id })));
      }),
      create: jest.fn(({ data }: any) => {
        if (data.idempotencyKey) {
          for (const v of promises.values()) {
            if (v.idempotencyKey === data.idempotencyKey) {
              const err: any = new Prisma.PrismaClientKnownRequestError(
                'Unique constraint failed',
                { code: 'P2002', clientVersion: 'test' } as any,
              );
              return Promise.reject(err);
            }
          }
        }
        const id = `p-${++promiseAutoId}`;
        const row = {
          id,
          status: PromiseToPayStatus.ACTIVE,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        promises.set(id, row);
        return Promise.resolve(row);
      }),
      updateMany: jest.fn(({ where, data }: any) => {
        const row = promises.get(where.id);
        if (!row) return Promise.resolve({ count: 0 });
        if (where.status && row.status !== where.status) {
          return Promise.resolve({ count: 0 });
        }
        Object.assign(row, data);
        return Promise.resolve({ count: 1 });
      }),
    },
    promiseEvent: {
      create: jest.fn(({ data }: any) => {
        events.push(data);
        return Promise.resolve({ id: `e-${events.length}`, ...data });
      }),
    },
  };

  const prisma: any = {
    ...tx,
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  return { prisma, promises, events, tx };
}

describe('V20.5 — Phase 2 PromisesToPayService', () => {
  it('rejects non-positive promisedAmount', async () => {
    const { prisma } = makeStore();
    const svc = new PromisesToPayService(prisma);
    await expect(
      svc.create({
        customerId: 'c-1',
        promisedAmount: '0',
        promisedDate: new Date(Date.now() + 86_400_000),
        collectorId: 'u-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects past promisedDate', async () => {
    const { prisma } = makeStore();
    const svc = new PromisesToPayService(prisma);
    await expect(
      svc.create({
        customerId: 'c-1',
        promisedAmount: '10',
        promisedDate: new Date('2020-01-01T00:00:00.000Z'),
        collectorId: 'u-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects amounts above sanity bound', async () => {
    const { prisma } = makeStore();
    const svc = new PromisesToPayService(prisma);
    await expect(
      svc.create({
        customerId: 'c-1',
        promisedAmount: '500000',
        promisedDate: new Date(Date.now() + 86_400_000),
        collectorId: 'u-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates an ACTIVE promise + CREATED event', async () => {
    const { prisma, promises, events } = makeStore();
    const svc = new PromisesToPayService(prisma);
    const out = await svc.create({
      customerId: 'c-1',
      promisedAmount: '30',
      promisedDate: new Date(Date.now() + 86_400_000),
      collectorId: 'u-1',
      notes: 'will pay tomorrow',
    });
    expect(out.created).toBe(true);
    expect(out.status).toBe(PromiseToPayStatus.ACTIVE);
    expect(promises.size).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('CREATED');
  });

  it('idempotencyKey returns existing row on duplicate', async () => {
    const { prisma } = makeStore();
    const svc = new PromisesToPayService(prisma);
    const future = new Date(Date.now() + 86_400_000);

    const a = await svc.create({
      customerId: 'c-1',
      promisedAmount: '30',
      promisedDate: future,
      collectorId: 'u-1',
      idempotencyKey: 'cc-session:42:c-1',
    });
    const b = await svc.create({
      customerId: 'c-1',
      promisedAmount: '30',
      promisedDate: future,
      collectorId: 'u-1',
      idempotencyKey: 'cc-session:42:c-1',
    });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.id).toBe(a.id);
  });

  it('markKept transitions ACTIVE → KEPT once and is no-op on retry', async () => {
    const { prisma, promises, events } = makeStore();
    const svc = new PromisesToPayService(prisma);
    const created = await svc.create({
      customerId: 'c-1',
      promisedAmount: '30',
      promisedDate: new Date(Date.now() + 86_400_000),
      collectorId: 'u-1',
    });
    const r1 = await svc.markKept({ promiseId: created.id, actorId: 'u-2' });
    const r2 = await svc.markKept({ promiseId: created.id, actorId: 'u-2' });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
    expect(promises.get(created.id)!.status).toBe(PromiseToPayStatus.KEPT);
    // CREATED + KEPT only — second attempt did not write a duplicate event
    expect(events.filter((e: any) => e.kind === 'KEPT')).toHaveLength(1);
  });

  it('throws NotFound when promise id does not exist', async () => {
    const { prisma } = makeStore();
    const svc = new PromisesToPayService(prisma);
    await expect(
      svc.markKept({ promiseId: 'nope', actorId: 'u' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('autoFlipBrokenPromises is a no-op when cron flag is off', async () => {
    delete process.env.PROMISES_CRON_ENABLED;
    const { prisma } = makeStore();
    const svc = new PromisesToPayService(prisma);
    await svc.autoFlipBrokenPromises();
    expect(prisma.promiseToPay.findMany).not.toHaveBeenCalled();
  });

  it('autoFlipBrokenPromises flips ACTIVE rows past grace window', async () => {
    process.env.PROMISES_CRON_ENABLED = 'true';
    try {
      const { prisma, promises, events } = makeStore();
      const svc = new PromisesToPayService(prisma);
      // Seed an old ACTIVE promise (promisedDate 24h ago > 12h grace).
      const created = await svc.create({
        customerId: 'c-1',
        promisedAmount: '30',
        promisedDate: new Date(Date.now() + 86_400_000),
        collectorId: 'u-1',
      });
      // Mutate promisedDate retroactively to simulate a stale row.
      promises.get(created.id)!.promisedDate = new Date(
        Date.now() - 24 * 60 * 60 * 1000,
      );

      await svc.autoFlipBrokenPromises();

      expect(promises.get(created.id)!.status).toBe(
        PromiseToPayStatus.BROKEN,
      );
      expect(events.some((e: any) => e.kind === 'BROKEN')).toBe(true);
    } finally {
      delete process.env.PROMISES_CRON_ENABLED;
    }
  });
});
