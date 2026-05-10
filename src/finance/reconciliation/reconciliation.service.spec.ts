/* eslint-disable @typescript-eslint/no-explicit-any */
import { Prisma } from '@prisma/client';
import { ReconciliationService, FINANCE_DRIFT_EVENT } from './reconciliation.service';

/**
 * V20.4 — Phase 6 reconciliation engine unit tests.
 *
 * The service is deterministic and has no Date.now() dependencies
 * inside its decision logic — every assertion is a pure
 * comparison of decimal totals. We mock the PrismaService and
 * EventEmitter2 to drive the four invariants through their
 * happy / drift cases without a live DB.
 */
describe('ReconciliationService (V20.4 Phase 6)', () => {
  function makePrisma(opts: {
    journalLineAggDebit?: string;
    journalLineAggCredit?: string;
    walletLiabilityLines?: Array<{ debit: string; credit: string }>;
    arLines?: Array<{ debit: string; credit: string }>;
    walletBalanceSum?: string;
    rawSqlResults?: Map<string, unknown>;
    snapshotRemainingDebtSum?: string;
    snapshotRowCount?: number;
  }) {
    const rawResults = opts.rawSqlResults ?? new Map();
    return {
      journalLine: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: {
            debit: new Prisma.Decimal(opts.journalLineAggDebit ?? '0'),
            credit: new Prisma.Decimal(opts.journalLineAggCredit ?? '0'),
          },
        }),
        findMany: jest.fn().mockImplementation((args: any) => {
          const code = args?.where?.account?.code;
          if (code === '2100') {
            return Promise.resolve(
              (opts.walletLiabilityLines ?? []).map((l) => ({
                debit: new Prisma.Decimal(l.debit),
                credit: new Prisma.Decimal(l.credit),
              })),
            );
          }
          if (code === '1300') {
            return Promise.resolve(
              (opts.arLines ?? []).map((l) => ({
                debit: new Prisma.Decimal(l.debit),
                credit: new Prisma.Decimal(l.credit),
              })),
            );
          }
          return Promise.resolve([]);
        }),
      },
      customerWallet: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: {
            balance: new Prisma.Decimal(opts.walletBalanceSum ?? '0'),
          },
        }),
      },
      financialSnapshot: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: {
            remainingDebtKd: new Prisma.Decimal(
              opts.snapshotRemainingDebtSum ?? '0',
            ),
          },
          _count: { _all: opts.snapshotRowCount ?? 0 },
        }),
      },
      $queryRaw: jest.fn().mockImplementation((strings: any) => {
        const sql = (strings.join ? strings.join('') : String(strings))
          .replace(/\s+/g, ' ')
          .trim();
        if (sql.includes('GROUP BY a."type"')) {
          return Promise.resolve(
            rawResults.get('balance_sheet') ?? [
              { type: 'ASSET', total: '0' },
              { type: 'LIABILITY', total: '0' },
            ],
          );
        }
        if (sql.includes('FROM "Order"')) {
          return Promise.resolve(
            rawResults.get('invoice_remaining') ?? [{ total: '0' }],
          );
        }
        return Promise.resolve([]);
      }),
    } as any;
  }

  function makeJournal(): any {
    return {
      // ReconciliationService doesn't call any journal method,
      // but the constructor signature requires the dep.
    };
  }

  function makeEvents(): any {
    return { emit: jest.fn() };
  }

  it('reports OK when all five invariants hold within tolerance', async () => {
    const prisma = makePrisma({
      journalLineAggDebit: '1000.0000',
      journalLineAggCredit: '1000.0000',
      walletLiabilityLines: [
        { debit: '0', credit: '500' },
        { debit: '100', credit: '0' },
      ], // net liability = 400
      arLines: [
        { debit: '300', credit: '50' },
      ], // net AR = 250
      walletBalanceSum: '400',
      // V24: snapshot Σ remainingDebtKd matches journal AR (250).
      snapshotRemainingDebtSum: '250',
      snapshotRowCount: 7,
      rawSqlResults: new Map<string, unknown>([
        // ASSETS = 600 (CASH 100 + AR 500), LIAB = 400 (WALLET), EQ = 0,
        // REVENUE = 200 (credit-normal so DR-CR is -200), EXPENSE = 0
        // → assets(600) = liab(400) + equity(0) + (revenue 200 − expense 0) → balanced.
        [
          'balance_sheet',
          [
            { type: 'ASSET', total: '600' },
            { type: 'LIABILITY', total: '-400' },
            { type: 'EQUITY', total: '0' },
            { type: 'REVENUE', total: '-200' },
            { type: 'EXPENSE', total: '0' },
          ],
        ],
        ['invoice_remaining', [{ total: '250' }]],
      ]),
    });
    const events = makeEvents();
    const svc = new ReconciliationService(
      prisma,
      makeJournal(),
      events,
    );

    const report = await svc.runOnce();

    expect(report.driftCount).toBe(0);
    expect(report.ok).toBe(true);
    expect(report.rows).toHaveLength(5);
    expect(report.rows.every((r) => r.ok)).toBe(true);
    expect(events.emit).not.toHaveBeenCalled();
    const snapshotRow = report.rows.find(
      (r) => r.invariant === 'SNAPSHOT_AR_MATCH',
    );
    expect(snapshotRow?.detail).toBe('snapshotCount=7');
  });

  it('flags TRIAL_BALANCE drift when Σ DR ≠ Σ CR', async () => {
    const prisma = makePrisma({
      journalLineAggDebit: '1000.0000',
      journalLineAggCredit: '950.0000',
    });
    const events = makeEvents();
    const svc = new ReconciliationService(prisma, makeJournal(), events);

    const report = await svc.runOnce();
    const trial = report.rows.find((r) => r.invariant === 'TRIAL_BALANCE');
    expect(trial?.ok).toBe(false);
    expect(trial?.deltaKd).toBe('50.0000');
    expect(trial?.detail).toBe('JOURNAL_INTERNALLY_UNBALANCED');
    expect(report.ok).toBe(false);
    expect(events.emit).toHaveBeenCalledWith(
      FINANCE_DRIFT_EVENT,
      expect.objectContaining({ invariant: 'TRIAL_BALANCE' }),
    );
  });

  it('flags WALLET_LIABILITY_MATCH drift when journal vs wallet table diverge', async () => {
    const prisma = makePrisma({
      journalLineAggDebit: '500',
      journalLineAggCredit: '500',
      walletLiabilityLines: [{ debit: '0', credit: '500' }], // journal says 500
      walletBalanceSum: '450', // wallet table says 450
    });
    const events = makeEvents();
    const svc = new ReconciliationService(prisma, makeJournal(), events);

    const report = await svc.runOnce();
    const row = report.rows.find(
      (r) => r.invariant === 'WALLET_LIABILITY_MATCH',
    );
    expect(row?.ok).toBe(false);
    expect(row?.deltaKd).toBe('50.0000');
  });

  it('flags AR_INTEGRITY drift when journal AR != Σ open invoice remaining', async () => {
    const prisma = makePrisma({
      journalLineAggDebit: '300',
      journalLineAggCredit: '300',
      arLines: [{ debit: '300', credit: '50' }], // journal AR = 250
      // V24: keep SNAPSHOT_AR_MATCH happy in this test by aligning
      // the snapshot total to the journal AR (250) — the AR_INTEGRITY
      // drift here is between journal AR and the LEGACY invoice view,
      // not the V20.4 projection.
      snapshotRemainingDebtSum: '250',
      snapshotRowCount: 4,
      rawSqlResults: new Map<string, unknown>([
        ['invoice_remaining', [{ total: '999' }]], // legacy says 999
      ]),
    });
    const events = makeEvents();
    const svc = new ReconciliationService(prisma, makeJournal(), events);

    const report = await svc.runOnce();
    const row = report.rows.find((r) => r.invariant === 'AR_INTEGRITY');
    expect(row?.ok).toBe(false);
    expect(row?.deltaKd).toBe('-749.0000');
  });

  it('flags SNAPSHOT_AR_MATCH drift when projection diverges from journal AR (V24)', async () => {
    const prisma = makePrisma({
      journalLineAggDebit: '500',
      journalLineAggCredit: '500',
      arLines: [{ debit: '500', credit: '100' }], // journal AR = 400
      snapshotRemainingDebtSum: '350.0000', // projector says 350 → drift = 50
      snapshotRowCount: 12,
    });
    const events = makeEvents();
    const svc = new ReconciliationService(prisma, makeJournal(), events);

    const report = await svc.runOnce();
    const row = report.rows.find((r) => r.invariant === 'SNAPSHOT_AR_MATCH');
    expect(row?.ok).toBe(false);
    expect(row?.expectedKd).toBe('400.0000');
    expect(row?.actualKd).toBe('350.0000');
    expect(row?.deltaKd).toBe('50.0000');
    expect(row?.detail).toContain('SNAPSHOT_PROJECTION_DRIFT');
    expect(row?.detail).toContain('snapshotCount=12');
    expect(events.emit).toHaveBeenCalledWith(
      FINANCE_DRIFT_EVENT,
      expect.objectContaining({ invariant: 'SNAPSHOT_AR_MATCH' }),
    );
  });

  it('SNAPSHOT_AR_MATCH passes within tolerance band (sub-fils slack)', async () => {
    const prisma = makePrisma({
      journalLineAggDebit: '500',
      journalLineAggCredit: '500',
      arLines: [{ debit: '500', credit: '100' }], // journal AR = 400
      snapshotRemainingDebtSum: '399.9995', // 0.0005 KD inside the 0.001 tolerance
      snapshotRowCount: 5,
    });
    const events = makeEvents();
    const svc = new ReconciliationService(prisma, makeJournal(), events);

    const report = await svc.runOnce();
    const row = report.rows.find((r) => r.invariant === 'SNAPSHOT_AR_MATCH');
    expect(row?.ok).toBe(true);
    expect(row?.detail).toBe('snapshotCount=5');
  });

  it('emits one FINANCE_DRIFT_EVENT per failing invariant, none on OK rows', async () => {
    const prisma = makePrisma({
      journalLineAggDebit: '100',
      journalLineAggCredit: '50', // TRIAL fails
      walletLiabilityLines: [{ debit: '0', credit: '50' }],
      walletBalanceSum: '50', // WALLET ok
    });
    const events = makeEvents();
    const svc = new ReconciliationService(prisma, makeJournal(), events);

    await svc.runOnce();

    const emittedInvariants = (events.emit as jest.Mock).mock.calls.map(
      (c) => c[1].invariant,
    );
    expect(emittedInvariants).toContain('TRIAL_BALANCE');
    expect(emittedInvariants).not.toContain('WALLET_LIABILITY_MATCH');
  });
});
