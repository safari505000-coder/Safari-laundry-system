/**
 * LedgerProjectionService — STRICTLY READ-ONLY double-entry projection.
 *
 * Stage A of the strict-ledger migration:
 *   - Existing writers continue calling `generalLedger.append()` (single-entry).
 *   - This service projects the existing canonical tables
 *     (`GeneralLedgerEntry`, `ManagerCashCustody`, `BankDepositLog`,
 *     `Order`, `BranchExpense`) into a stream of paired LedgerEntry
 *     rows (`debit + credit per txId`) that satisfy the
 *     `Σdebit == Σcredit` invariant by construction.
 *   - All five `/api/finance/ledger/*` endpoints derive everything from
 *     this projection — no parallel calculation, no stored balance.
 *
 * SAFETY POSTURE
 * --------------
 *   - NEVER writes to the database.
 *   - NEVER mutates a writer.
 *   - The projection is a pure function of (date range, optional filter).
 *     Re-running it with the same inputs MUST return identical entries.
 *   - The reconciliation invariant is checked AT CONSTRUCTION; if a
 *     producer ever drifts (e.g. a new POS_SALE_COMPLETED row with
 *     null actorUserId), the projection emits an UNATTRIBUTED row
 *     instead of silently dropping the value, so the auditor sees it.
 *
 * Account naming convention (Section 1 of the brief):
 *   DRIVER_<userId>      cash held by driver (POS cash sales pending handover)
 *   MANAGER_<userId>     cash held by branch manager (custody bag, pre-deposit)
 *   COMPANY_CASH         non-driver/non-manager cash claims
 *   BANK_ACCOUNT         settled funds (KNET, ONLINE, verified deposits)
 *   REVENUE_POS          income statement: POS sales recognised
 *   EXPENSE_<category>   income statement: expense bucket
 *   UNATTRIBUTED         catches malformed source rows; never empty in
 *                        a healthy production database
 */
import { Injectable } from '@nestjs/common';
import {
  GeneralLedgerEntryType,
  ManagerCashCustodyStatus,
  PosPaymentMethod,
  Prisma,
  SafariRole,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type LedgerEntry = {
  /** Stable, deterministic transaction id grouping ≥2 entries that balance. */
  txId: string;
  /** Entry id within the projection (deterministic: `<txId>:<side>:<n>`). */
  id: string;
  /** Account code per the Section 1 naming convention. */
  accountId: string;
  /** Always >= 0; either debit or credit is non-zero, never both. */
  debit: string;
  credit: string;
  /** ISO8601 — sourced from the underlying canonical row. */
  createdAt: string;
  /** Source row metadata (entry type, source table, related ids). */
  meta: Record<string, unknown>;
};

export type AccountBalanceRow = {
  accountId: string;
  totalDebit: string;
  totalCredit: string;
  /** SUM(debit) - SUM(credit). Sign-significant; KD format (4dp). */
  balance: string;
  entryCount: number;
};

export type ReconciliationReport = {
  status: 'PASS' | 'FAIL';
  fromIso: string;
  toIso: string;
  totalEntries: number;
  totalTransactions: number;
  globalDebit: string;
  globalCredit: string;
  /** Per-tx imbalances. Empty array == PASS. */
  unbalancedTransactions: Array<{
    txId: string;
    debit: string;
    credit: string;
    delta: string;
  }>;
  /** Source rows that could not be attributed to a holder. */
  unattributedEntries: number;
  generatedAt: string;
};

export type LedgerProjectionInput = {
  fromIso: string;
  toIso: string;
};

const DEC_ZERO = new Prisma.Decimal(0);

function toFixed4(d: Prisma.Decimal): string {
  return d.toFixed(4);
}

function pair(
  txId: string,
  createdAt: Date,
  debitAccount: string,
  creditAccount: string,
  amount: Prisma.Decimal,
  meta: Record<string, unknown>,
): LedgerEntry[] {
  if (amount.lessThanOrEqualTo(0)) {
    // Zero or negative source rows are dropped from the projection;
    // the EXPENSE_RECORDED CREATED marker (amount=0) and unrelated
    // signal rows do not affect any account balance.
    return [];
  }
  const iso = createdAt.toISOString();
  return [
    {
      txId,
      id: `${txId}:DR:0`,
      accountId: debitAccount,
      debit: toFixed4(amount),
      credit: toFixed4(DEC_ZERO),
      createdAt: iso,
      meta,
    },
    {
      txId,
      id: `${txId}:CR:0`,
      accountId: creditAccount,
      debit: toFixed4(DEC_ZERO),
      credit: toFixed4(amount),
      createdAt: iso,
      meta,
    },
  ];
}

@Injectable()
export class LedgerProjectionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build the projection for a date range. Pure: same inputs always
   * yield the same entries in the same order (sorted by createdAt
   * then txId).
   *
   * Sources:
   *   1. GeneralLedgerEntry (POS_SALE_COMPLETED, EXPENSE_RECORDED)
   *      — projected per-event with ownerType-derived counter accounts.
   *   2. ManagerCashCustody — projected as TWO transactions per bag:
   *      `mch:<id>:HANDOVER` (driver → manager) at receivedFromDriverAt,
   *      `mch:<id>:VERIFIED` (manager → bank) at verifiedAt (only if
   *      status=VERIFIED).
   *
   * The DEBT_ADJUSTMENT and WALLET_SETTLEMENT GL types are intentionally
   * NOT projected from `GeneralLedgerEntry`: the cash effect for
   * WALLET_SETTLEMENT is already captured by the ManagerCashCustody
   * VERIFIED transaction (avoids double-counting), and DEBT_ADJUSTMENT
   * rows in the current dataset carry both source and target driver
   * inside the metadata payload but lack a stable account split for
   * Stage A. They will be projected in Stage B once writers post
   * paired rows directly.
   */
  async project(input: LedgerProjectionInput): Promise<LedgerEntry[]> {
    const from = new Date(input.fromIso);
    const to = new Date(input.toIso);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new Error('Invalid date range');
    }

    const entries: LedgerEntry[] = [];

    // ─── 1. POS sales (cash → cash holder, non-cash → bank) ──────
    //
    // CASH POS routing depends on the actor's safariRole:
    //   - DRIVER actor      → DR DRIVER_<id>   (cash sits with the driver)
    //   - MANAGER actor     → DR MANAGER_<id>  (manager rang it up themselves;
    //                                            the cash is in the manager's
    //                                            drawer right now)
    //   - any other actor   → DR COMPANY_CASH  (back-office user; cash lands
    //                                            in the company pool until
    //                                            someone formally picks it up)
    //   - missing actor     → DR UNATTRIBUTED  (canary — a healthy DB has 0)
    //
    // Pre-Stage-A this branch hard-coded `DRIVER_<id>` for every CASH POS,
    // which silently misclassified manager-rung CASH sales as driver cash.
    // The cash IS in the ledger either way (Σdebit = Σcredit holds), but
    // the projection account was wrong by one hop, which made the
    // /api/manager/cash-status snapshot under-report a manager's actual
    // held cash.
    const posRows = await this.prisma.generalLedgerEntry.findMany({
      where: {
        entryType: GeneralLedgerEntryType.POS_SALE_COMPLETED,
        createdAt: { gte: from, lte: to },
      },
      select: {
        id: true,
        amount: true,
        actorUserId: true,
        orderId: true,
        customerId: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    // Batch-fetch the safariRole of every distinct CASH actor in this
    // projection so we don't issue one user query per row.
    const cashActorIds = [
      ...new Set(
        posRows
          .filter((r) => {
            const meta = (r.metadata ?? {}) as Record<string, unknown>;
            return (
              String(meta.posPaymentMethod ?? '') === PosPaymentMethod.CASH &&
              !!r.actorUserId
            );
          })
          .map((r) => r.actorUserId as string),
      ),
    ];
    const actorRoleById = new Map<string, SafariRole>();
    if (cashActorIds.length) {
      const actors = await this.prisma.user.findMany({
        where: { id: { in: cashActorIds } },
        select: { id: true, safariRole: true },
      });
      for (const u of actors) actorRoleById.set(u.id, u.safariRole);
    }
    for (const r of posRows) {
      const amount = new Prisma.Decimal(r.amount.toString());
      if (amount.lessThanOrEqualTo(0)) continue;
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const method = String(meta.posPaymentMethod ?? '');
      let debitAccount: string;
      if (method === PosPaymentMethod.CASH) {
        if (!r.actorUserId) {
          debitAccount = 'UNATTRIBUTED';
        } else {
          const role = actorRoleById.get(r.actorUserId) ?? null;
          if (role === SafariRole.DRIVER) {
            debitAccount = `DRIVER_${r.actorUserId}`;
          } else if (role === SafariRole.MANAGER) {
            debitAccount = `MANAGER_${r.actorUserId}`;
          } else if (role === null) {
            // Actor row no longer exists (deleted user). Stay UNATTRIBUTED
            // so the auditor sees the orphan instead of silently absorbing
            // the cash into COMPANY_CASH.
            debitAccount = 'UNATTRIBUTED';
          } else {
            // OWNER / GENERAL_MANAGER / ACCOUNTANT / SUPERVISOR / etc.
            // Back-office sale; the cash is in the company pool.
            debitAccount = 'COMPANY_CASH';
          }
        }
      } else if (
        method === PosPaymentMethod.KNET ||
        method === PosPaymentMethod.PAYMENT_LINK ||
        method === PosPaymentMethod.ONLINE
      ) {
        debitAccount = 'BANK_ACCOUNT';
      } else if (
        method === PosPaymentMethod.DEBT_ON_ACCOUNT ||
        method === PosPaymentMethod.SUBSCRIPTION_WALLET
      ) {
        // Customer is invoiced but no cash moves at sale time.
        // Counter-account is COMPANY_CASH (the company books a receivable).
        debitAccount = 'COMPANY_CASH';
      } else {
        debitAccount = 'UNATTRIBUTED';
      }
      entries.push(
        ...pair(
          `gl:${r.id}`,
          r.createdAt,
          debitAccount,
          'REVENUE_POS',
          amount,
          {
            source: 'GeneralLedgerEntry',
            entryType: 'POS_SALE_COMPLETED',
            posPaymentMethod: method || null,
            actorRole: r.actorUserId
              ? actorRoleById.get(r.actorUserId) ?? null
              : null,
            orderId: r.orderId,
            customerId: r.customerId,
            actorUserId: r.actorUserId,
          },
        ),
      );
    }

    // ─── 2. Approved expenses (debit EXPENSE_<cat>, credit holder) ─
    // The `EXPENSE_RECORDED` GL row is written twice per expense:
    // once at CREATE (amount=0, marker only) and once at APPROVED
    // (amount=expense.amount). The projection only emits paired
    // entries for the APPROVED row, since amount=0 has no balance
    // effect.
    const expenseRows = await this.prisma.generalLedgerEntry.findMany({
      where: {
        entryType: GeneralLedgerEntryType.EXPENSE_RECORDED,
        createdAt: { gte: from, lte: to },
        amount: { gt: 0 },
      },
      select: {
        id: true,
        amount: true,
        actorUserId: true,
        expenseId: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    const expenseIds = expenseRows
      .map((r) => r.expenseId)
      .filter((x): x is string => !!x);
    const expensesById = new Map<
      string,
      { branchId: string | null; recordedById: string }
    >();
    if (expenseIds.length) {
      const exp = await this.prisma.branchExpense.findMany({
        where: { id: { in: expenseIds } },
        select: { id: true, branchId: true, recordedById: true },
      });
      for (const e of exp) {
        expensesById.set(e.id, {
          branchId: e.branchId,
          recordedById: e.recordedById,
        });
      }
      const recorderIds = [...new Set(exp.map((e) => e.recordedById))];
      const recorders = await this.prisma.user.findMany({
        where: { id: { in: recorderIds } },
        select: { id: true, safariRole: true },
      });
      const recorderRole = new Map(recorders.map((u) => [u.id, u.safariRole]));
      for (const r of expenseRows) {
        const amount = new Prisma.Decimal(r.amount.toString());
        if (amount.lessThanOrEqualTo(0)) continue;
        const meta = (r.metadata ?? {}) as Record<string, unknown>;
        const category = String(meta.category ?? 'MISC');
        const expense = r.expenseId ? expensesById.get(r.expenseId) : null;
        const role = expense ? recorderRole.get(expense.recordedById) : null;
        let creditAccount: string;
        if (role === 'DRIVER' && expense) {
          creditAccount = `DRIVER_${expense.recordedById}`;
        } else if (role === 'MANAGER' && expense) {
          creditAccount = `MANAGER_${expense.recordedById}`;
        } else {
          creditAccount = 'COMPANY_CASH';
        }
        entries.push(
          ...pair(
            `gl:${r.id}`,
            r.createdAt,
            `EXPENSE_${category}`,
            creditAccount,
            amount,
            {
              source: 'GeneralLedgerEntry',
              entryType: 'EXPENSE_RECORDED',
              expenseId: r.expenseId,
              actorUserId: r.actorUserId,
              recorderRole: role ?? null,
              event: meta.event ?? null,
            },
          ),
        );
      }
    }

    // ─── 3. ManagerCashCustody → driver→manager handover ──────────
    const custodies = await this.prisma.managerCashCustody.findMany({
      where: { receivedFromDriverAt: { gte: from, lte: to } },
      select: {
        id: true,
        managerId: true,
        driverId: true,
        branchId: true,
        amountKd: true,
        receivedFromDriverAt: true,
        verifiedAt: true,
        status: true,
      },
      orderBy: { receivedFromDriverAt: 'asc' },
    });
    for (const c of custodies) {
      const amount = new Prisma.Decimal(c.amountKd.toString());
      if (amount.lessThanOrEqualTo(0)) continue;
      entries.push(
        ...pair(
          `mch:${c.id}:HANDOVER`,
          c.receivedFromDriverAt,
          `MANAGER_${c.managerId}`,
          `DRIVER_${c.driverId}`,
          amount,
          {
            source: 'ManagerCashCustody',
            event: 'HANDOVER',
            custodyId: c.id,
            branchId: c.branchId,
            status: c.status,
          },
        ),
      );
    }

    // ─── 4. ManagerCashCustody VERIFIED → manager→bank ────────────
    const verified = await this.prisma.managerCashCustody.findMany({
      where: {
        status: ManagerCashCustodyStatus.VERIFIED,
        verifiedAt: { gte: from, lte: to, not: null },
      },
      select: {
        id: true,
        managerId: true,
        amountKd: true,
        verifiedAt: true,
        branchId: true,
      },
      orderBy: { verifiedAt: 'asc' },
    });
    for (const c of verified) {
      const amount = new Prisma.Decimal(c.amountKd.toString());
      if (amount.lessThanOrEqualTo(0) || !c.verifiedAt) continue;
      entries.push(
        ...pair(
          `mch:${c.id}:VERIFIED`,
          c.verifiedAt,
          'BANK_ACCOUNT',
          `MANAGER_${c.managerId}`,
          amount,
          {
            source: 'ManagerCashCustody',
            event: 'VERIFIED',
            custodyId: c.id,
            branchId: c.branchId,
          },
        ),
      );
    }

    // Stable order: createdAt ASC then txId then id.
    entries.sort((a, b) => {
      if (a.createdAt !== b.createdAt) {
        return a.createdAt < b.createdAt ? -1 : 1;
      }
      if (a.txId !== b.txId) return a.txId < b.txId ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });

    return entries;
  }

  /** Aggregate per-account balances over a projection. */
  aggregateAccounts(entries: LedgerEntry[]): AccountBalanceRow[] {
    const acc = new Map<
      string,
      { debit: Prisma.Decimal; credit: Prisma.Decimal; count: number }
    >();
    for (const e of entries) {
      const cur = acc.get(e.accountId) ?? {
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(0),
        count: 0,
      };
      cur.debit = cur.debit.plus(new Prisma.Decimal(e.debit));
      cur.credit = cur.credit.plus(new Prisma.Decimal(e.credit));
      cur.count += 1;
      acc.set(e.accountId, cur);
    }
    return [...acc.entries()]
      .map(([accountId, v]) => ({
        accountId,
        totalDebit: toFixed4(v.debit),
        totalCredit: toFixed4(v.credit),
        balance: toFixed4(v.debit.minus(v.credit)),
        entryCount: v.count,
      }))
      .sort((a, b) => a.accountId.localeCompare(b.accountId));
  }

  /**
   * Run the SUM(debit) == SUM(credit) invariant globally and per-tx.
   * Returns a structured report; an empty `unbalancedTransactions[]`
   * means PASS. The projection is balanced by construction; this is
   * the assertion that catches any future code path that adds an
   * un-paired entry.
   */
  reconcile(
    entries: LedgerEntry[],
    fromIso: string,
    toIso: string,
  ): ReconciliationReport {
    let globalDebit = new Prisma.Decimal(0);
    let globalCredit = new Prisma.Decimal(0);
    const txs = new Map<
      string,
      { debit: Prisma.Decimal; credit: Prisma.Decimal }
    >();
    let unattributed = 0;
    for (const e of entries) {
      globalDebit = globalDebit.plus(new Prisma.Decimal(e.debit));
      globalCredit = globalCredit.plus(new Prisma.Decimal(e.credit));
      const cur = txs.get(e.txId) ?? {
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(0),
      };
      cur.debit = cur.debit.plus(new Prisma.Decimal(e.debit));
      cur.credit = cur.credit.plus(new Prisma.Decimal(e.credit));
      txs.set(e.txId, cur);
      if (e.accountId === 'UNATTRIBUTED') unattributed += 1;
    }
    const unbalanced: ReconciliationReport['unbalancedTransactions'] = [];
    for (const [txId, v] of txs) {
      const delta = v.debit.minus(v.credit);
      if (!delta.isZero()) {
        unbalanced.push({
          txId,
          debit: toFixed4(v.debit),
          credit: toFixed4(v.credit),
          delta: toFixed4(delta),
        });
      }
    }
    return {
      status:
        unbalanced.length === 0 && globalDebit.equals(globalCredit)
          ? 'PASS'
          : 'FAIL',
      fromIso,
      toIso,
      totalEntries: entries.length,
      totalTransactions: txs.size,
      globalDebit: toFixed4(globalDebit),
      globalCredit: toFixed4(globalCredit),
      unbalancedTransactions: unbalanced,
      unattributedEntries: unattributed,
      generatedAt: new Date().toISOString(),
    };
  }
}
