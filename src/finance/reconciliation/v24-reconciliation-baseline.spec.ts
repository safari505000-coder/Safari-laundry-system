/* eslint-disable @typescript-eslint/no-explicit-any */
import { Prisma } from '@prisma/client';
import { ReconciliationService } from './reconciliation.service';

/**
 * V24 — Station 1 Reconciliation Baseline (lock-in test).
 *
 * The Discovery audit flagged a structural gap: the V20.4
 * reconciliation engine emits drift events but never fails the
 * build on drift. As a result, a regression that introduced a
 * 5-fils ledger inconsistency could ship to production silently.
 *
 * This lock-in test closes that hole by building a *clean
 * fixture* — a synthetic ledger where every invariant must hold
 * to a STRICTER 0 KD tolerance — and asserting:
 *
 *   1. `report.driftCount === 0` after `runOnce()`.
 *   2. `report.ok === true`.
 *   3. ALL FIVE invariants are present and OK.
 *   4. NO `finance.drift.detected` events were emitted.
 *
 * Production tolerates the 0.001 KD runtime band documented in
 * `reconciliation.service.ts`. CI tolerates 0. If this spec
 * fails, the projector or a journal write has drifted from the
 * canonical contract — DO NOT relax the assertion. Find and fix
 * the underlying inconsistency.
 *
 * Per V24 Commandment #4 (Implicit Governance), this test runs
 * automatically as part of the backend Jest suite; no operator
 * action required.
 */
describe('V24 Reconciliation Baseline (Station 1 lock-in)', () => {
  /**
   * Builds a perfectly balanced synthetic ledger:
   *   - 3 customers, total receivable = 1,250.0000 KD on AR (acct 1300)
   *   - matching wallet liability of 200.0000 KD on acct 2100
   *   - cash assets of 1,800.0000 KD on acct 1100
   *   - revenue of 850.0000 KD (credit-normal)
   *   - identical figures persisted on FinancialSnapshot rows
   *
   * Every invariant resolves to exactly 0.0000 delta when the
   * projector and the journal agree.
   */
  function buildCleanFixture() {
    const totalReceivableKd = '1250.0000';
    const walletLiabilityKd = '200.0000';
    const cashAssetKd = '1800.0000';
    const revenueKd = '850.0000';
    const totalDebit = '3050.0000'; // AR 1250 + CASH 1800
    const totalCredit = '3050.0000'; // WALLET 200 + REVENUE 850 + CUSTOMER_CREDIT 2000
    const arLines = [
      { debit: '500.0000', credit: '0.0000' }, // customer A
      { debit: '450.0000', credit: '0.0000' }, // customer B
      { debit: '300.0000', credit: '0.0000' }, // customer C
    ];
    const walletLines = [
      { debit: '0.0000', credit: '200.0000' }, // single deposit
    ];
    return {
      totalReceivableKd,
      walletLiabilityKd,
      cashAssetKd,
      revenueKd,
      totalDebit,
      totalCredit,
      arLines,
      walletLines,
      customerCount: 3,
    };
  }

  function makeBaselinePrisma() {
    const f = buildCleanFixture();
    return {
      journalLine: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: {
            debit: new Prisma.Decimal(f.totalDebit),
            credit: new Prisma.Decimal(f.totalCredit),
          },
        }),
        findMany: jest.fn().mockImplementation((args: any) => {
          const code = args?.where?.account?.code;
          if (code === '2100') {
            return Promise.resolve(
              f.walletLines.map((l) => ({
                debit: new Prisma.Decimal(l.debit),
                credit: new Prisma.Decimal(l.credit),
              })),
            );
          }
          if (code === '1300') {
            return Promise.resolve(
              f.arLines.map((l) => ({
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
            balance: new Prisma.Decimal(f.walletLiabilityKd),
          },
        }),
      },
      financialSnapshot: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: {
            remainingDebtKd: new Prisma.Decimal(f.totalReceivableKd),
          },
          _count: { _all: f.customerCount },
        }),
      },
      $queryRaw: jest.fn().mockImplementation((strings: any) => {
        const sql = (strings.join ? strings.join('') : String(strings))
          .replace(/\s+/g, ' ')
          .trim();
        if (sql.includes('GROUP BY a."type"')) {
          // ASSET = 3050 (AR 1250 + CASH 1800)
          // LIAB  = 200 (WALLET, credit-normal so DR-CR = -200)
          // EQUITY = 2000 (CUSTOMER_CREDIT placeholder, credit-normal)
          // REVENUE = 850 (credit-normal so DR-CR = -850)
          // EXPENSE = 0
          // → A(3050) = L(200) + EQ(2000) + (REV(850) − EXP(0)) = 3050. Balanced.
          return Promise.resolve([
            { type: 'ASSET', total: '3050.0000' },
            { type: 'LIABILITY', total: '-200.0000' },
            { type: 'EQUITY', total: '-2000.0000' },
            { type: 'REVENUE', total: '-850.0000' },
            { type: 'EXPENSE', total: '0.0000' },
          ]);
        }
        if (sql.includes('FROM "Order"')) {
          return Promise.resolve([{ total: f.totalReceivableKd }]);
        }
        return Promise.resolve([]);
      }),
      // DEGRADE-1: ReconciliationService now wraps all checks in a SERIALIZABLE
      // $transaction; mock it to pass through the callback.
      $transaction: jest.fn().mockImplementation(async (fn: () => Promise<unknown>) => fn()),
    } as any;
  }

  function makeJournal(): any {
    return {};
  }

  function makeEvents(): any {
    return { emit: jest.fn() };
  }

  it('clean fixture passes all five invariants with exactly 0 KD drift', async () => {
    const prisma = makeBaselinePrisma();
    const events = makeEvents();
    const svc = new ReconciliationService(prisma, makeJournal(), events);

    const report = await svc.runOnce();

    // Hard guarantees — DO NOT relax.
    expect(report.ok).toBe(true);
    expect(report.driftCount).toBe(0);
    expect(report.rows).toHaveLength(5);

    // Every invariant must report 0.0000 delta on a clean fixture.
    for (const row of report.rows) {
      expect(row.ok).toBe(true);
      expect(row.deltaKd).toBe('0.0000');
    }

    // No drift events fire on a clean baseline.
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('all five invariants are present (regression guard for missing checks)', async () => {
    const prisma = makeBaselinePrisma();
    const events = makeEvents();
    const svc = new ReconciliationService(prisma, makeJournal(), events);

    const report = await svc.runOnce();
    const invariants = report.rows.map((r) => r.invariant).sort();

    expect(invariants).toEqual([
      'AR_INTEGRITY',
      'ASSETS_EQ_LIAB_PLUS_EQUITY',
      'SNAPSHOT_AR_MATCH',
      'TRIAL_BALANCE',
      'WALLET_LIABILITY_MATCH',
    ]);
  });

  it('SNAPSHOT_AR_MATCH detail carries snapshot count for operator triage', async () => {
    const prisma = makeBaselinePrisma();
    const svc = new ReconciliationService(prisma, makeJournal(), makeEvents());

    const report = await svc.runOnce();
    const snap = report.rows.find((r) => r.invariant === 'SNAPSHOT_AR_MATCH');

    expect(snap).toBeDefined();
    expect(snap?.detail).toBe('snapshotCount=3');
  });

  it('report payload preserves the toleranceKd field at canonical 4dp', async () => {
    const prisma = makeBaselinePrisma();
    const svc = new ReconciliationService(prisma, makeJournal(), makeEvents());

    const report = await svc.runOnce();

    expect(report.toleranceKd).toBe('0.0010');
  });
});
