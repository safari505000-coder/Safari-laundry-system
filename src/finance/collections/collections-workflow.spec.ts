/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CollectionsStage, Prisma } from '@prisma/client';
import { CollectionsWorkflowService } from './collections-workflow.service';

function makeStore() {
  const accounts = new Map<string, any>();
  const events: any[] = [];
  let autoId = 0;

  const tx = {
    collectionsAccount: {
      findUnique: jest.fn(({ where }: any) => {
        if (where.customerId) {
          for (const v of accounts.values()) {
            if (v.customerId === where.customerId) {
              return Promise.resolve(v);
            }
          }
          return Promise.resolve(null);
        }
        if (where.id) return Promise.resolve(accounts.get(where.id) ?? null);
        return Promise.resolve(null);
      }),
      findMany: jest.fn(({ where, take, orderBy }: any = {}) => {
        const out = [...accounts.values()].filter((a) => {
          if (where?.nextActionDueAt?.lt) {
            if (!a.nextActionDueAt) return false;
            if (a.nextActionDueAt >= where.nextActionDueAt.lt) return false;
          }
          if (where?.currentStage?.notIn) {
            if (where.currentStage.notIn.includes(a.currentStage)) return false;
          }
          return true;
        });
        if (orderBy?.nextActionDueAt === 'asc') {
          out.sort((a, b) => (a.nextActionDueAt?.getTime() ?? 0) - (b.nextActionDueAt?.getTime() ?? 0));
        }
        return Promise.resolve(take ? out.slice(0, take) : out);
      }),
      create: jest.fn(({ data }: any) => {
        for (const v of accounts.values()) {
          if (v.customerId === data.customerId) {
            const err: any = new Prisma.PrismaClientKnownRequestError(
              'unique',
              { code: 'P2002', clientVersion: 'test' } as any,
            );
            return Promise.reject(err);
          }
        }
        const id = `a-${++autoId}`;
        const row = {
          id,
          ...data,
          escalationLevel: data.escalationLevel ?? 0,
          openedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        accounts.set(id, row);
        return Promise.resolve(row);
      }),
      update: jest.fn(({ where, data }: any) => {
        const row = accounts.get(where.id);
        if (!row) return Promise.reject(new Error('not found'));
        Object.assign(row, data);
        return Promise.resolve(row);
      }),
    },
    collectionsStageEvent: {
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
  return { prisma, accounts, events, tx };
}

describe('V20.5 — Phase 3 CollectionsWorkflowService', () => {
  it('openOrGet creates a NEW account and CREATED event', async () => {
    const { prisma, accounts, events } = makeStore();
    const svc = new CollectionsWorkflowService(prisma);
    const out = await svc.openOrGet({
      customerId: 'cust-1',
      actorId: 'u-1',
      assignedCollectorId: 'u-2',
    });
    expect(out.currentStage).toBe(CollectionsStage.NEW);
    expect(accounts.size).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0].toStage).toBe(CollectionsStage.NEW);
    expect(out.nextActionDueAt).toBeInstanceOf(Date);
  });

  it('openOrGet is idempotent', async () => {
    const { prisma } = makeStore();
    const svc = new CollectionsWorkflowService(prisma);
    const a = await svc.openOrGet({ customerId: 'cust-1' });
    const b = await svc.openOrGet({ customerId: 'cust-1' });
    expect(a.id).toBe(b.id);
  });

  it('forward transitions are recorded with audit + escalation bump', async () => {
    const { prisma, accounts, events } = makeStore();
    const svc = new CollectionsWorkflowService(prisma);
    const acc = await svc.openOrGet({ customerId: 'cust-1' });

    const r1 = await svc.transition({
      customerId: 'cust-1',
      toStage: CollectionsStage.CONTACTED,
      actorId: 'u-1',
    });
    expect(r1.ok).toBe(true);
    expect(accounts.get(acc.id)!.currentStage).toBe(CollectionsStage.CONTACTED);
    expect(accounts.get(acc.id)!.escalationLevel).toBe(0);

    const r2 = await svc.transition({
      customerId: 'cust-1',
      toStage: CollectionsStage.ESCALATED,
      actorId: 'u-1',
    });
    expect(r2.ok).toBe(true);
    expect(accounts.get(acc.id)!.currentStage).toBe(CollectionsStage.ESCALATED);
    expect(accounts.get(acc.id)!.escalationLevel).toBe(1);

    const r3 = await svc.transition({
      customerId: 'cust-1',
      toStage: CollectionsStage.LEGAL,
      actorId: 'u-1',
    });
    expect(r3.ok).toBe(true);
    expect(accounts.get(acc.id)!.escalationLevel).toBe(2);

    expect(events.length).toBeGreaterThanOrEqual(4); // CREATED + 3 transitions
    expect(events.some((e: any) => e.escalationLevelAfter === 2)).toBe(true);
  });

  it('rejects backward transitions (forward-only)', async () => {
    const { prisma } = makeStore();
    const svc = new CollectionsWorkflowService(prisma);
    await svc.openOrGet({ customerId: 'cust-1' });
    await svc.transition({
      customerId: 'cust-1',
      toStage: CollectionsStage.ESCALATED,
      actorId: 'u-1',
    });
    await expect(
      svc.transition({
        customerId: 'cust-1',
        toStage: CollectionsStage.CONTACTED,
        actorId: 'u-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('WRITTEN_OFF requires writeOffAmountKd', async () => {
    const { prisma } = makeStore();
    const svc = new CollectionsWorkflowService(prisma);
    await svc.openOrGet({ customerId: 'cust-1' });
    await expect(
      svc.transition({
        customerId: 'cust-1',
        toStage: CollectionsStage.WRITTEN_OFF,
        actorId: 'u-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const ok = await svc.transition({
      customerId: 'cust-1',
      toStage: CollectionsStage.WRITTEN_OFF,
      actorId: 'u-1',
      writeOffAmountKd: '120.5',
    });
    expect(ok.ok).toBe(true);
  });

  it('reopen is allowed only on terminal accounts', async () => {
    const { prisma, accounts, events } = makeStore();
    const svc = new CollectionsWorkflowService(prisma);
    const acc = await svc.openOrGet({ customerId: 'cust-1' });

    await expect(
      svc.reopen({ customerId: 'cust-1', actorId: 'u-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await svc.transition({
      customerId: 'cust-1',
      toStage: CollectionsStage.CLOSED,
      actorId: 'u-1',
    });
    const r = await svc.reopen({ customerId: 'cust-1', actorId: 'u-1' });
    expect(r.ok).toBe(true);
    expect(accounts.get(acc.id)!.currentStage).toBe(CollectionsStage.NEW);
    expect(accounts.get(acc.id)!.escalationLevel).toBe(0);
    expect(events.some((e: any) => e.reason === 'REOPENED')).toBe(true);
  });

  it('recordContact auto-promotes NEW → CONTACTED', async () => {
    const { prisma, accounts, events } = makeStore();
    const svc = new CollectionsWorkflowService(prisma);
    const acc = await svc.openOrGet({ customerId: 'cust-1' });

    const r = await svc.recordContact({
      customerId: 'cust-1',
      actorId: 'u-1',
      notes: 'left voicemail',
    });
    expect(r.ok).toBe(true);
    expect(accounts.get(acc.id)!.currentStage).toBe(CollectionsStage.CONTACTED);
    expect(events.some((e: any) => e.reason === 'AUTO_CONTACTED')).toBe(true);

    const r2 = await svc.recordContact({
      customerId: 'cust-1',
      actorId: 'u-1',
      notes: 'spoke to brother',
    });
    expect(r2.ok).toBe(true);
    expect(events.some((e: any) => e.reason === 'CONTACT_LOGGED')).toBe(true);
  });

  it('throws NotFound when transitioning a non-existent account', async () => {
    const { prisma } = makeStore();
    const svc = new CollectionsWorkflowService(prisma);
    await expect(
      svc.transition({
        customerId: 'cust-zzz',
        toStage: CollectionsStage.CONTACTED,
        actorId: 'u-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('STAGE_RANK is monotonically increasing along the lifecycle', () => {
    const order: CollectionsStage[] = [
      CollectionsStage.NEW,
      CollectionsStage.CONTACTED,
      CollectionsStage.FOLLOW_UP,
      CollectionsStage.PROMISE_TO_PAY,
      CollectionsStage.ESCALATED,
      CollectionsStage.LEGAL,
    ];
    for (let i = 1; i < order.length; i++) {
      expect(
        CollectionsWorkflowService.STAGE_RANK[order[i]],
      ).toBeGreaterThan(CollectionsWorkflowService.STAGE_RANK[order[i - 1]]);
    }
  });
});
