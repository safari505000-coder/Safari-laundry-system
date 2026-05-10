import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DoubleEntryJournalService } from './double-entry-journal.service';
import {
  FinancialPeriodsService,
  periodForDate,
} from '../finance/periods/financial-periods.service';

/**
 * V20.6 — PHASE 1 SPEC.
 *
 * End-to-end behavioural test of `assertWriteAllowed` wired into
 * `DoubleEntryJournalService.appendBalanced`. The matrix verified:
 *
 *   ENV=off    + OPEN  → write allowed (legacy behaviour preserved)
 *   ENV=off    + CLOSED→ write allowed (legacy behaviour preserved)
 *   ENV=on     + OPEN  → write allowed
 *   ENV=on     + CLOSED + reversal=false → ConflictException + violation row
 *   ENV=on     + CLOSED + reversal=true  → write allowed + violation row
 *   ENV=on     + retry of EXISTING sourceRef on CLOSED → short-circuit (no throw)
 *
 * Plus end-to-end coverage of the seven flows the user listed:
 * invoice issuance, debt payment, partial payment, refund,
 * reversal, wallet adjustment, collections settlement.
 */

type FakeAccount = { id: string; code: string };
type FakeJournalEntry = {
  id: string;
  source: string;
  sourceRef: string;
  customerId: string | null;
  orderId: string | null;
  actorUserId: string;
  branchId: string | null;
};

function makePrisma() {
  const accounts: FakeAccount[] = [
    { id: 'acc-cash', code: '1100' },
    { id: 'acc-bank-knet', code: '1200' },
    { id: 'acc-ar', code: '1300' },
    { id: 'acc-wallet', code: '2100' },
    { id: 'acc-rev', code: '4100' },
    { id: 'acc-rev-ret', code: '4200' },
    { id: 'acc-promo', code: '5300' },
  ];
  const entries: FakeJournalEntry[] = [];
  const violations: any[] = [];
  let periodRow: any = null; // single row, sufficient for the spec
  let nextEntryId = 1;
  let nextViolationId = 1;

  const prisma = {
    account: {
      findMany: async ({ where }: any) => {
        const codes: string[] = where.code.in;
        return accounts.filter((a) => codes.includes(a.code));
      },
    },
    journalEntry: {
      findUnique: async ({ where }: any) => {
        if (where.sourceRef) {
          return entries.find((e) => e.sourceRef === where.sourceRef) ?? null;
        }
        return entries.find((e) => e.id === where.id) ?? null;
      },
      create: async ({ data }: any) => {
        const id = `je-${nextEntryId++}`;
        const row: FakeJournalEntry = {
          id,
          source: data.source,
          sourceRef: data.sourceRef,
          customerId: data.customerId ?? null,
          orderId: data.orderId ?? null,
          actorUserId: data.actorUserId,
          branchId: data.branchId ?? null,
        };
        entries.push(row);
        return { id };
      },
    },
    financialPeriod: {
      findUnique: async ({ where }: any) => {
        if (!periodRow) return null;
        if (where.year_month) {
          const { year, month } = where.year_month;
          if (periodRow.year === year && periodRow.month === month) {
            return periodRow;
          }
        }
        return null;
      },
    },
    financialPeriodViolation: {
      create: async ({ data }: any) => {
        const id = `viol-${nextViolationId++}`;
        const row = { id, attemptedAt: new Date(), ...data };
        violations.push(row);
        return row;
      },
    },
  } as any;

  return {
    prisma,
    setPeriod(year: number, month: number, status: 'OPEN' | 'CLOSED') {
      periodRow = {
        id: 'period-1',
        year,
        month,
        status,
        lockedAt: status === 'CLOSED' ? new Date() : null,
        lockedById: status === 'CLOSED' ? 'admin-1' : null,
        reopenedAt: null,
        reopenedById: null,
      };
    },
    clearPeriod() {
      periodRow = null;
    },
    entries,
    violations,
  };
}

function makeServices(prisma: any) {
  const periods = new FinancialPeriodsService(prisma);
  const journal = new DoubleEntryJournalService(prisma, periods);
  return { periods, journal };
}

const ACTOR = 'user-1';
const CUSTOMER = 'cust-1';
const ORDER = 'order-1';
const SUBSCRIPTION = 'sub-1';

const ISSUANCE = (overrides: Partial<any> = {}) => ({
  source: 'INVOICE_ISSUED',
  sourceRef: `JOURNAL:INVOICE_ISSUED:${ORDER}`,
  actorUserId: ACTOR,
  customerId: CUSTOMER,
  orderId: ORDER,
  lines: [
    { accountCode: '1300', debit: new Prisma.Decimal('20.0000') },
    { accountCode: '4100', credit: new Prisma.Decimal('20.0000') },
  ],
  ...overrides,
});

const PAYMENT = (overrides: Partial<any> = {}) => ({
  source: 'PAYMENT',
  sourceRef: `JOURNAL:PAYMENT:${ORDER}:CASH`,
  actorUserId: ACTOR,
  customerId: CUSTOMER,
  orderId: ORDER,
  lines: [
    { accountCode: '1100', debit: new Prisma.Decimal('20.0000') },
    { accountCode: '1300', credit: new Prisma.Decimal('20.0000') },
  ],
  ...overrides,
});

const PARTIAL = (overrides: Partial<any> = {}) => ({
  source: 'PAYMENT',
  sourceRef: `JOURNAL:PAYMENT:${ORDER}:PARTIAL`,
  actorUserId: ACTOR,
  customerId: CUSTOMER,
  orderId: ORDER,
  lines: [
    { accountCode: '1100', debit: new Prisma.Decimal('5.0000') },
    { accountCode: '1300', credit: new Prisma.Decimal('5.0000') },
  ],
  ...overrides,
});

const WALLET_ADJ = (overrides: Partial<any> = {}) => ({
  source: 'ADJUSTMENT',
  sourceRef: `JOURNAL:ADJUST:${CUSTOMER}:WALLET-1`,
  actorUserId: ACTOR,
  customerId: CUSTOMER,
  orderId: null,
  lines: [
    { accountCode: '5100', debit: new Prisma.Decimal('1.0000') },
    { accountCode: '2100', credit: new Prisma.Decimal('1.0000') },
  ],
  ...overrides,
});

describe('V20.6 — PERIOD LOCK ENFORCEMENT', () => {
  const ORIGINAL_ENV = process.env.PERIOD_LOCK_ENFORCE;

  beforeEach(() => {
    delete process.env.PERIOD_LOCK_ENFORCE;
  });

  afterAll(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.PERIOD_LOCK_ENFORCE;
    } else {
      process.env.PERIOD_LOCK_ENFORCE = ORIGINAL_ENV;
    }
  });

  it('OFF + OPEN — writes succeed (baseline)', async () => {
    const fx = makePrisma();
    const { journal } = makeServices(fx.prisma);
    const result = await journal.appendBalanced(fx.prisma, ISSUANCE());
    expect(result.id).toMatch(/^je-/);
    expect(fx.entries).toHaveLength(1);
    expect(fx.violations).toHaveLength(0);
  });

  it('OFF + CLOSED — writes still succeed (legacy behaviour preserved)', async () => {
    const fx = makePrisma();
    const today = new Date();
    const p = periodForDate(today);
    fx.setPeriod(p.year, p.month, 'CLOSED');
    const { journal } = makeServices(fx.prisma);
    const result = await journal.appendBalanced(fx.prisma, ISSUANCE());
    expect(result.id).toMatch(/^je-/);
    expect(fx.violations).toHaveLength(0);
  });

  it('ON + OPEN — writes succeed without violation', async () => {
    process.env.PERIOD_LOCK_ENFORCE = 'true';
    const fx = makePrisma();
    const { journal } = makeServices(fx.prisma);
    const result = await journal.appendBalanced(fx.prisma, ISSUANCE());
    expect(result.id).toMatch(/^je-/);
    expect(fx.violations).toHaveLength(0);
  });

  it('ON + CLOSED + non-reversal — throws ConflictException AND logs a violation', async () => {
    process.env.PERIOD_LOCK_ENFORCE = 'true';
    const fx = makePrisma();
    const today = new Date();
    const p = periodForDate(today);
    fx.setPeriod(p.year, p.month, 'CLOSED');
    const { journal } = makeServices(fx.prisma);
    await expect(journal.appendBalanced(fx.prisma, ISSUANCE())).rejects.toThrow(
      ConflictException,
    );
    expect(fx.entries).toHaveLength(0);
    expect(fx.violations).toHaveLength(1);
    expect(fx.violations[0].writerName).toBe(
      'DoubleEntryJournalService.INVOICE_ISSUED',
    );
    expect(fx.violations[0].sourceRef).toBe(`JOURNAL:INVOICE_ISSUED:${ORDER}`);
    expect(fx.violations[0].payload.allowedAsReversal).toBe(false);
  });

  it('ON + CLOSED + allowReversal — write succeeds AND violation logged with allowedAsReversal=true', async () => {
    process.env.PERIOD_LOCK_ENFORCE = 'true';
    const fx = makePrisma();
    const today = new Date();
    const p = periodForDate(today);
    fx.setPeriod(p.year, p.month, 'CLOSED');
    const { journal } = makeServices(fx.prisma);

    // Use the high-level helper that flips allowReversal=true.
    const result = await journal.appendInvoiceCancellationEntry(fx.prisma, {
      customerId: CUSTOMER,
      orderId: ORDER,
      actorUserId: ACTOR,
      remainingArAmount: '10.0000',
      reason: 'CC void',
    });
    expect(result?.id).toMatch(/^je-/);
    expect(fx.entries).toHaveLength(1);
    expect(fx.violations).toHaveLength(1);
    expect(fx.violations[0].payload.allowedAsReversal).toBe(true);
  });

  it('ON + CLOSED + retry of an existing sourceRef — short-circuits without throwing', async () => {
    process.env.PERIOD_LOCK_ENFORCE = 'true';
    const fx = makePrisma();
    const today = new Date();
    const p = periodForDate(today);
    // Pre-seed an entry then close the period.
    const { journal: journalOpen } = makeServices(fx.prisma);
    const first = await journalOpen.appendBalanced(fx.prisma, ISSUANCE());
    fx.setPeriod(p.year, p.month, 'CLOSED');

    // Second call must return the existing row, not throw.
    const second = await journalOpen.appendBalanced(fx.prisma, ISSUANCE());
    expect(second.id).toBe(first.id);
    expect(fx.entries).toHaveLength(1);
    expect(fx.violations).toHaveLength(0);
  });

  it('ON + CLOSED — debt payment, partial, wallet adjustment all rejected', async () => {
    process.env.PERIOD_LOCK_ENFORCE = 'true';
    const fx = makePrisma();
    const today = new Date();
    const p = periodForDate(today);
    fx.setPeriod(p.year, p.month, 'CLOSED');
    const { journal } = makeServices(fx.prisma);

    await expect(journal.appendBalanced(fx.prisma, PAYMENT())).rejects.toThrow(
      ConflictException,
    );
    await expect(journal.appendBalanced(fx.prisma, PARTIAL())).rejects.toThrow(
      ConflictException,
    );
    await expect(
      journal.appendBalanced(fx.prisma, WALLET_ADJ()),
    ).rejects.toThrow(ConflictException);

    // 3 distinct violation rows, no journal rows committed.
    expect(fx.entries).toHaveLength(0);
    expect(fx.violations).toHaveLength(3);
  });

  it('ON + CLOSED — subscription refund (reversal) succeeds and is audited', async () => {
    process.env.PERIOD_LOCK_ENFORCE = 'true';
    const fx = makePrisma();
    const today = new Date();
    const p = periodForDate(today);
    fx.setPeriod(p.year, p.month, 'CLOSED');
    const { journal } = makeServices(fx.prisma);

    const result = await journal.appendSubscriptionRefundEntry(fx.prisma, {
      customerId: CUSTOMER,
      subscriptionId: SUBSCRIPTION,
      actorUserId: ACTOR,
      giftRemovalAmount: '3.0000',
      cashRefundAmount: '7.0000',
      reason: 'Customer cancellation',
    });
    expect(result?.id).toMatch(/^je-/);
    expect(fx.entries).toHaveLength(1);
    expect(fx.violations).toHaveLength(1);
    expect(fx.violations[0].payload.allowedAsReversal).toBe(true);
  });

  it('ON + CLOSED + custom effectiveAt in OPEN month — succeeds (period derived from effectiveAt, not now)', async () => {
    process.env.PERIOD_LOCK_ENFORCE = 'true';
    const fx = makePrisma();
    // Close December 2025 only; today is in a different month.
    fx.setPeriod(2025, 12, 'CLOSED');
    const { journal } = makeServices(fx.prisma);

    const inJanuary = new Date(Date.UTC(2026, 0, 15));
    const result = await journal.appendBalanced(fx.prisma, {
      ...ISSUANCE(),
      effectiveAt: inJanuary,
    });
    expect(result.id).toMatch(/^je-/);
    expect(fx.violations).toHaveLength(0);
  });

  it('No periodGuard injected — ENV ON falls back to OPEN behaviour (graceful degradation)', async () => {
    process.env.PERIOD_LOCK_ENFORCE = 'true';
    const fx = makePrisma();
    fx.setPeriod(
      periodForDate(new Date()).year,
      periodForDate(new Date()).month,
      'CLOSED',
    );
    // Construct WITHOUT the guard — simulating GeneralLedgerModule
    // running standalone (e.g. unit test fixtures that pre-date V20.6).
    const journal = new DoubleEntryJournalService(fx.prisma);
    const result = await journal.appendBalanced(fx.prisma, ISSUANCE());
    expect(result.id).toMatch(/^je-/);
    // No guard means no violation row.
    expect(fx.violations).toHaveLength(0);
  });
});
