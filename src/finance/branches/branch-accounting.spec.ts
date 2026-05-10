/* eslint-disable @typescript-eslint/no-explicit-any */
import { Prisma } from '@prisma/client';
import { BranchAccountingService } from './branch-accounting.service';

/**
 * V20.5 — Phase 9 Branch accounting unit tests.
 *
 * Mocks `prisma.$queryRaw` and `prisma.branch.findMany` since the
 * service goes straight to SQL for the aggregation. The contract
 * we verify:
 *   • `branchId === null` rolls into the "UNATTRIBUTED" bucket.
 *   • Per-row drift = debit − credit, signed.
 *   • Cross-branch reconciliation totals agree with the per-branch
 *     row sums and report `reconciled=true` when |drift| ≤ 0.001.
 */

describe('V20.5 — Phase 9 BranchAccountingService', () => {
  function makePrisma(rows: Array<{ branchId: string | null; debit: string; credit: string }>) {
    return {
      $queryRaw: jest.fn().mockImplementation(async () => rows),
      branch: {
        findMany: jest.fn(async ({ where }: any) => {
          const ids: string[] = where?.id?.in ?? [];
          return ids.map((id) => ({ id, name: `Branch ${id}` }));
        }),
      },
    } as any;
  }

  it('trialBalance maps null branchId to UNATTRIBUTED', async () => {
    const prisma = makePrisma([
      { branchId: 'b-1', debit: '100', credit: '100' },
      { branchId: null, debit: '50', credit: '50' },
    ]);
    const svc = new BranchAccountingService(prisma);
    const r = await svc.trialBalance();
    const ids = r.map((x) => x.branchId);
    expect(ids).toContain('b-1');
    expect(ids).toContain('UNATTRIBUTED');
  });

  it('drift is signed (debit − credit)', async () => {
    const prisma = makePrisma([
      { branchId: 'b-1', debit: '100', credit: '90' },
    ]);
    const svc = new BranchAccountingService(prisma);
    const r = await svc.trialBalance();
    expect(r[0].driftKd).toBe('10.0000');
  });

  it('crossBranchReconciliation sums to org-wide and flags reconciled', async () => {
    const prisma = makePrisma([
      { branchId: 'b-1', debit: '100', credit: '100' },
      { branchId: 'b-2', debit: '50', credit: '50' },
    ]);
    const svc = new BranchAccountingService(prisma);
    const r = await svc.crossBranchReconciliation();
    expect(r.totalDebitKd).toBe('150.0000');
    expect(r.totalCreditKd).toBe('150.0000');
    expect(r.driftKd).toBe('0.0000');
    expect(r.reconciled).toBe(true);
    expect(r.branches).toBe(2);
  });

  it('crossBranchReconciliation flags drift when org-wide does not balance', async () => {
    const prisma = makePrisma([
      { branchId: 'b-1', debit: '100', credit: '90' }, // 10 drift
      { branchId: 'b-2', debit: '50', credit: '50' },
    ]);
    const svc = new BranchAccountingService(prisma);
    const r = await svc.crossBranchReconciliation();
    expect(r.driftKd).toBe('10.0000');
    expect(r.reconciled).toBe(false);
  });
});
