import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * V20.5 — Phase 9 Multi-Branch Accounting (read-side).
 *
 * Aggregates the canonical journal by branch to produce:
 *   • per-branch trial balance (Σ debit / Σ credit)
 *   • per-branch P&L (revenue, expense, net)
 *   • per-branch receivables (account 1300 net)
 *   • per-branch cash position (accounts 1100/1200/1210 net)
 *
 * Pure read; never writes. The branch attribution lives on
 * `JournalEntry.branchId` (added in Phase 9 migration); historical
 * entries with `branchId IS NULL` aggregate into the "UNATTRIBUTED"
 * bucket so cross-branch totals always reconcile to the org-wide
 * grand total.
 *
 * Cross-branch reconciliation invariant:
 *
 *   Σ branch.totalDebit  ==  Σ JournalLine.debit  (over the same window)
 *   Σ branch.totalCredit ==  Σ JournalLine.credit
 *   Σ branch.totalDebit  ==  Σ branch.totalCredit (within each branch
 *                                                   IF the branch has
 *                                                   complete entries)
 *
 * The third invariant can break for individual branches when an
 * entry's lines straddle branches (rare; only happens for explicit
 * cross-branch transfers). The org-wide pair always balances.
 */
export type BranchTrialBalance = {
  branchId: string | 'UNATTRIBUTED';
  branchName: string | null;
  totalDebitKd: string;
  totalCreditKd: string;
  driftKd: string;
};

export type BranchPnl = {
  branchId: string | 'UNATTRIBUTED';
  branchName: string | null;
  revenueKd: string;
  expenseKd: string;
  netIncomeKd: string;
};

export type BranchReceivables = {
  branchId: string | 'UNATTRIBUTED';
  branchName: string | null;
  accountsReceivableKd: string;
  cashKd: string;
};

@Injectable()
export class BranchAccountingService {
  private readonly logger = new Logger(BranchAccountingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Per-branch trial balance over the optional time window.
   * Returns one row per branch (plus "UNATTRIBUTED" for legacy
   * entries) sorted by `branchName`.
   */
  async trialBalance(opts?: {
    asOf?: Date;
    sinceDate?: Date;
  }): Promise<BranchTrialBalance[]> {
    const where = this.dateFilter(opts);
    const rows = await this.prisma.$queryRaw<
      Array<{ branchId: string | null; debit: string; credit: string }>
    >(this.trialBalanceSql(where));
    const branches = await this.branchesById(rows.map((r) => r.branchId));
    return rows.map((r) => {
      const debit = new Prisma.Decimal(r.debit ?? '0');
      const credit = new Prisma.Decimal(r.credit ?? '0');
      return {
        branchId: r.branchId ?? 'UNATTRIBUTED',
        branchName: r.branchId ? (branches.get(r.branchId) ?? null) : null,
        totalDebitKd: debit.toFixed(4),
        totalCreditKd: credit.toFixed(4),
        driftKd: debit.sub(credit).toFixed(4),
      };
    });
  }

  /**
   * Per-branch P&L. Revenue = sum of credits on REVENUE accounts.
   * Expense = sum of debits on EXPENSE accounts. Net = Revenue −
   * Expense.
   */
  async profitAndLoss(opts?: {
    asOf?: Date;
    sinceDate?: Date;
  }): Promise<BranchPnl[]> {
    const where = this.dateFilter(opts);
    const rows = await this.prisma.$queryRaw<
      Array<{
        branchId: string | null;
        revenue: string;
        expense: string;
      }>
    >(Prisma.sql`
      SELECT
        je."branchId" AS "branchId",
        COALESCE(SUM(CASE WHEN a."type" = 'REVENUE' THEN jl."credit" ELSE 0 END), 0) AS "revenue",
        COALESCE(SUM(CASE WHEN a."type" = 'EXPENSE' THEN jl."debit"  ELSE 0 END), 0) AS "expense"
      FROM "JournalEntry" je
      JOIN "JournalLine" jl ON jl."entryId" = je."id"
      JOIN "Account" a ON a."id" = jl."accountId"
      ${where}
      GROUP BY je."branchId"
      ORDER BY je."branchId" NULLS LAST
    `);
    const branches = await this.branchesById(rows.map((r) => r.branchId));
    return rows.map((r) => {
      const revenue = new Prisma.Decimal(r.revenue ?? '0');
      const expense = new Prisma.Decimal(r.expense ?? '0');
      return {
        branchId: r.branchId ?? 'UNATTRIBUTED',
        branchName: r.branchId ? (branches.get(r.branchId) ?? null) : null,
        revenueKd: revenue.toFixed(4),
        expenseKd: expense.toFixed(4),
        netIncomeKd: revenue.sub(expense).toFixed(4),
      };
    });
  }

  /**
   * Per-branch AR + cash position. Reads net balance on the
   * receivable account (1300) and the canonical cash accounts.
   */
  async receivablesAndCash(opts?: {
    asOf?: Date;
    sinceDate?: Date;
  }): Promise<BranchReceivables[]> {
    const where = this.dateFilter(opts);
    const rows = await this.prisma.$queryRaw<
      Array<{
        branchId: string | null;
        ar: string;
        cash: string;
      }>
    >(Prisma.sql`
      SELECT
        je."branchId" AS "branchId",
        COALESCE(SUM(CASE WHEN a."code" = '1300' THEN jl."debit" - jl."credit" ELSE 0 END), 0) AS "ar",
        COALESCE(SUM(CASE WHEN a."code" IN ('1100','1200','1210') THEN jl."debit" - jl."credit" ELSE 0 END), 0) AS "cash"
      FROM "JournalEntry" je
      JOIN "JournalLine" jl ON jl."entryId" = je."id"
      JOIN "Account" a ON a."id" = jl."accountId"
      ${where}
      GROUP BY je."branchId"
      ORDER BY je."branchId" NULLS LAST
    `);
    const branches = await this.branchesById(rows.map((r) => r.branchId));
    return rows.map((r) => ({
      branchId: r.branchId ?? 'UNATTRIBUTED',
      branchName: r.branchId ? (branches.get(r.branchId) ?? null) : null,
      accountsReceivableKd: new Prisma.Decimal(r.ar ?? '0').toFixed(4),
      cashKd: new Prisma.Decimal(r.cash ?? '0').toFixed(4),
    }));
  }

  /**
   * Cross-branch reconciliation report. Rolls up `trialBalance`
   * to org-wide totals and asserts Σ debit == Σ credit.
   */
  async crossBranchReconciliation(opts?: { sinceDate?: Date }) {
    const tb = await this.trialBalance(opts);
    let debit = new Prisma.Decimal(0);
    let credit = new Prisma.Decimal(0);
    for (const r of tb) {
      debit = debit.add(new Prisma.Decimal(r.totalDebitKd));
      credit = credit.add(new Prisma.Decimal(r.totalCreditKd));
    }
    const drift = debit.sub(credit);
    return {
      asOf: new Date().toISOString(),
      branches: tb.length,
      totalDebitKd: debit.toFixed(4),
      totalCreditKd: credit.toFixed(4),
      driftKd: drift.toFixed(4),
      reconciled: drift.abs().lessThanOrEqualTo(new Prisma.Decimal('0.001')),
    };
  }

  // ── Internals ────────────────────────────────────────────────

  private trialBalanceSql(where: Prisma.Sql): Prisma.Sql {
    return Prisma.sql`
      SELECT
        je."branchId" AS "branchId",
        COALESCE(SUM(jl."debit"), 0)  AS "debit",
        COALESCE(SUM(jl."credit"), 0) AS "credit"
      FROM "JournalEntry" je
      JOIN "JournalLine" jl ON jl."entryId" = je."id"
      ${where}
      GROUP BY je."branchId"
      ORDER BY je."branchId" NULLS LAST
    `;
  }

  private dateFilter(opts?: { asOf?: Date; sinceDate?: Date }): Prisma.Sql {
    const conditions: Prisma.Sql[] = [];
    if (opts?.sinceDate) {
      conditions.push(Prisma.sql`je."createdAt" >= ${opts.sinceDate}`);
    }
    if (opts?.asOf) {
      conditions.push(Prisma.sql`je."createdAt" <= ${opts.asOf}`);
    }
    if (conditions.length === 0) return Prisma.empty;
    return Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
  }

  private async branchesById(ids: Array<string | null>): Promise<Map<string, string>> {
    const real = ids.filter((x): x is string => !!x);
    if (real.length === 0) return new Map();
    const rows = await this.prisma.branch.findMany({
      where: { id: { in: real } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}
