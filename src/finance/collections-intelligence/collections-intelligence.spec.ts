import { Prisma } from '@prisma/client';
import { CollectionsIntelligenceService } from './collections-intelligence.service';

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
          totalPrice: dec('60.0000'),
          createdAt: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
          dueDate: new Date(now.getTime() - 80 * 24 * 60 * 60 * 1000),
        },
        {
          id: 'o-2',
          totalPrice: dec('40.0000'),
          createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
          dueDate: null,
        },
      ]),
    },
    // V20.4 — Journal path: provide journal lines so computeOrderRemainingBalancesBatch
    // returns the correct remaining (full amount for o-1, partial for o-2).
    journalLine: {
      findMany: jest.fn(async (args: any) => {
        // Per-order issuance lines (DR on 1300).
        const orderIds: string[] = args?.where?.entry?.orderId?.in ?? [];
        const all = [
          { entry: { orderId: 'o-1' }, debit: dec('60.0000'), credit: dec('0') },
          { entry: { orderId: 'o-2' }, debit: dec('40.0000'), credit: dec('0') },
          // PAYMENT credit for o-2 (20 KD paid)
          { entry: { orderId: 'o-2' }, debit: dec('0'), credit: dec('20.0000') },
        ];
        if (orderIds.length > 0) {
          return all.filter((l) => orderIds.includes(l.entry.orderId));
        }
        return all;
      }),
    },
    journalEntry: {
      findMany: jest.fn(async () => []),
    },
  };
}

describe('CollectionsIntelligenceService', () => {
  let prevFlag: string | undefined;
  beforeAll(() => {
    prevFlag = process.env.V20_4_FINAL_LEDGER;
    process.env.V20_4_FINAL_LEDGER = 'true';
  });
  afterAll(() => {
    if (prevFlag === undefined) delete process.env.V20_4_FINAL_LEDGER;
    else process.env.V20_4_FINAL_LEDGER = prevFlag;
  });

  it('produces a deterministic priority score for the same inputs', async () => {
    const now = new Date('2026-05-15T12:00:00.000Z');
    const prisma = makePrisma(now);
    const svc = new CollectionsIntelligenceService(prisma as never, {} as never);
    const a = await svc.computeCustomerScore(CUST);
    const b = await svc.computeCustomerScore(CUST);
    expect(a.inputDigest).toBe(b.inputDigest);
    expect(a.priority).toBe(b.priority);
  });

  it('flags long overdue duration as elevated risk + priority', async () => {
    // Service uses real `Date.now()` for age math; reuse here so the
    // assertion stays stable regardless of when the spec runs.
    const now = new Date();
    const prisma = makePrisma(now);
    const svc = new CollectionsIntelligenceService(prisma as never, {} as never);
    const s = await svc.computeCustomerScore(CUST);
    expect(s.signals.overdueDays).toBeGreaterThanOrEqual(60);
    expect(s.riskScore).toBeGreaterThan(20);
    // Priority is the composite — risk-heavy, so it should sit at or
    // above the simple aging severity for a long-overdue balance.
    expect(s.priority).toBeGreaterThanOrEqual(40);
  });

  it('scoring is bounded 0..100', async () => {
    const now = new Date('2026-05-15T12:00:00.000Z');
    const prisma = makePrisma(now);
    const svc = new CollectionsIntelligenceService(prisma as never, {} as never);
    const s = await svc.computeCustomerScore(CUST);
    for (const v of [s.riskScore, s.priority, s.paymentProbability, s.agingSeverity, s.behaviorScore]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});
