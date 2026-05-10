import { Prisma } from '@prisma/client';
import { FinancialTimelineService } from './financial-timeline.service';

const CUST = '11111111-1111-4111-8111-111111111111';

function dec(s: string) {
  return new Prisma.Decimal(s);
}

function makePrisma(now: Date) {
  return {
    order: {
      findMany: jest.fn(async () => [
        {
          id: 'o-1',
          totalPrice: dec('20.0000'),
          createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          posPaymentMethod: null,
          cashStatus: 'UNPAID',
        },
      ]),
    },
    debtLedgerEntry: {
      findMany: jest.fn(async () => [
        {
          id: 'l-1',
          orderId: 'o-1',
          amount: dec('10.0000'),
          source: 'PAYMENT',
          sourceRef: 'PAYMENT:CASH:o-1',
          actorUserId: 'u-1',
          note: null,
          createdAt: new Date(now.getTime() - 30 * 60 * 1000),
        },
        {
          id: 'l-2',
          orderId: 'o-1',
          amount: dec('20.0000'),
          source: 'INVOICE_SHORTFALL',
          sourceRef: 'SHORTFALL:o-1',
          actorUserId: 'u-1',
          note: null,
          createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        },
      ]),
    },
    customerSubscription: {
      findMany: jest.fn(async () => [
        {
          id: 's-1',
          status: 'ACTIVE',
          activatedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
          expiresAt: new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000),
          planNameSnapshot: 'Gold 30',
          planSalePriceSnapshot: dec('12.0000'),
        },
      ]),
    },
    generalLedgerEntry: {
      findMany: jest.fn(async () => []),
    },
    // V20.5 — Phase 4 additional sources. Default empty arrays so
    // legacy assertions stay green; per-test overrides exercise
    // the merge logic.
    promiseEvent: {
      findMany: jest.fn(async () => []),
    },
    collectionsStageEvent: {
      findMany: jest.fn(async () => []),
    },
    journalEntry: {
      findMany: jest.fn(async () => []),
    },
  };
}

describe('FinancialTimelineService', () => {
  it('merges invoice / payment / shortfall / subscription events in reverse chronological order', async () => {
    const now = new Date('2026-05-15T12:00:00.000Z');
    const svc = new FinancialTimelineService(makePrisma(now) as never);
    const r = await svc.getTimeline(CUST, { limit: 50 });
    expect(r.customerId).toBe(CUST);
    const kinds = r.events.map((e) => e.kind);
    expect(kinds).toContain('INVOICE_ISSUED');
    expect(kinds).toContain('PAYMENT_RECORDED');
    expect(kinds).toContain('DEBT_ACCRUED');
    expect(kinds).toContain('SUBSCRIPTION_ACTIVATED');
    // Reverse-chronological — payment is the most recent.
    const sorted = [...r.events].sort(
      (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
    );
    expect(r.events.map((e) => e.id)).toEqual(sorted.map((e) => e.id));
  });

  it('paginates with the `before` cursor', async () => {
    const now = new Date('2026-05-15T12:00:00.000Z');
    const svc = new FinancialTimelineService(makePrisma(now) as never);
    const r = await svc.getTimeline(CUST, { limit: 1 });
    expect(r.events.length).toBe(1);
    expect(r.nextBeforeCursor).not.toBeNull();
  });

  it('V20.5 — merges promise / collections-stage / journal events', async () => {
    const now = new Date('2026-05-15T12:00:00.000Z');
    const prisma: any = makePrisma(now);
    prisma.promiseEvent.findMany = jest.fn(async () => [
      {
        id: 'pe-1',
        kind: 'CREATED',
        actorId: 'u-1',
        payload: null,
        createdAt: new Date(now.getTime() - 60_000),
        promise: {
          id: 'p-1',
          invoiceId: 'o-1',
          promisedAmount: dec('30.0000'),
          promisedDate: new Date(now.getTime() + 86_400_000),
        },
      },
      {
        id: 'pe-2',
        kind: 'BROKEN',
        actorId: null,
        payload: null,
        createdAt: new Date(now.getTime() - 30_000),
        promise: {
          id: 'p-1',
          invoiceId: 'o-1',
          promisedAmount: dec('30.0000'),
          promisedDate: new Date(now.getTime() - 3_600_000),
        },
      },
    ]);
    prisma.collectionsStageEvent.findMany = jest.fn(async () => [
      {
        id: 'cse-1',
        fromStage: 'NEW',
        toStage: 'CONTACTED',
        actorId: 'u-1',
        reason: 'AUTO_CONTACTED',
        createdAt: new Date(now.getTime() - 90_000),
      },
    ]);
    prisma.journalEntry.findMany = jest.fn(async () => [
      {
        id: 'je-1',
        source: 'INVOICE_ISSUED',
        sourceRef: 'JOURNAL:INVOICE_ISSUED:o-1',
        createdAt: new Date(now.getTime() - 120_000),
        orderId: 'o-1',
      },
    ]);
    const svc = new FinancialTimelineService(prisma as never);
    const r = await svc.getTimeline(CUST, { limit: 50 });

    const kinds = r.events.map((e) => e.kind);
    expect(kinds).toContain('PROMISE_CREATED');
    expect(kinds).toContain('PROMISE_BROKEN');
    expect(kinds).toContain('COLLECTIONS_STAGE_CHANGED');
    expect(kinds).toContain('JOURNAL_ENTRY');
  });
});
