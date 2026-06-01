import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  FinancialIntegrityError,
  FinancialIntegrityViolationCode,
} from './financial-integrity.errors';

type Db = PrismaService | Prisma.TransactionClient;

/**
 * A single posting line, in the shape callers already use for
 * `DoubleEntryJournalService.appendBalanced`.
 */
export type IntegrityLine = {
  accountCode?: string;
  debit?: Prisma.Decimal | string | number;
  credit?: Prisma.Decimal | string | number;
};

/** Tolerance band shared with the reconciliation engine (±0.001 KD). */
export const INTEGRITY_TOLERANCE = new Prisma.Decimal('0.001');

/**
 * FINANCIAL HARDENING — the reusable financial integrity guard.
 *
 * This is the single, explicit place where the "a financial operation
 * must be internally consistent or it must FAIL ENTIRELY" rules live.
 * It is intentionally framework-agnostic (throws plain
 * {@link FinancialIntegrityError}) so it can be invoked from inside any
 * `$transaction` in any financial service and, on violation, roll the
 * whole transaction back (no partial success).
 *
 * It does NOT replace `appendBalanced` (which keeps its own internal
 * checks) — it is a shared, independently-tested assertion layer that
 * critical services can call *before* committing money movements, and
 * that the accounting-health / reconciliation surfaces reuse.
 *
 * Rules enforced:
 *   - Debit = Credit per entry (±0.001)        → UNBALANCED_ENTRY
 *   - No negative lines                         → NEGATIVE_LINE
 *   - No ambiguous lines (debit & credit > 0)   → AMBIGUOUS_LINE
 *   - No empty lines                            → EMPTY_LINE
 *   - At least two lines                        → MINIMUM_TWO_LINES
 *   - No duplicate posting for a sourceRef      → DUPLICATE_POSTING
 *   - No double settlement of a payment ref     → DOUBLE_SETTLEMENT
 *   - No double reversal of an entry            → DOUBLE_REVERSAL
 *   - No invalid negative balance               → NEGATIVE_BALANCE
 */
@Injectable()
export class FinancialIntegrityService {
  constructor(private readonly prisma: PrismaService) {}

  private decimal(value: Prisma.Decimal | string | number | null | undefined): Prisma.Decimal {
    if (value === null || value === undefined) return new Prisma.Decimal(0);
    return value instanceof Prisma.Decimal
      ? value
      : new Prisma.Decimal(value.toString());
  }

  private fail(
    code: FinancialIntegrityViolationCode,
    message: string,
    detail?: Record<string, unknown>,
  ): never {
    throw new FinancialIntegrityError(code, message, detail);
  }

  /**
   * Validates that a set of journal lines forms a balanced, well-formed
   * double-entry. Throws {@link FinancialIntegrityError} on the first
   * violation. Pure / synchronous — safe to call before any DB write.
   */
  assertEntryBalanced(lines: ReadonlyArray<IntegrityLine>): void {
    if (!lines || lines.length < 2) {
      this.fail('MINIMUM_TWO_LINES', 'A journal entry requires at least two lines', {
        lineCount: lines?.length ?? 0,
      });
    }
    let totalDebit = new Prisma.Decimal(0);
    let totalCredit = new Prisma.Decimal(0);
    for (const line of lines) {
      const debit = this.decimal(line.debit);
      const credit = this.decimal(line.credit);
      if (debit.lessThan(0) || credit.lessThan(0)) {
        this.fail('NEGATIVE_LINE', 'Journal line has a negative amount', {
          accountCode: line.accountCode,
          debit: debit.toFixed(4),
          credit: credit.toFixed(4),
        });
      }
      if (debit.greaterThan(0) && credit.greaterThan(0)) {
        this.fail('AMBIGUOUS_LINE', 'Journal line has both debit and credit', {
          accountCode: line.accountCode,
        });
      }
      if (debit.equals(0) && credit.equals(0)) {
        this.fail('EMPTY_LINE', 'Journal line has neither debit nor credit', {
          accountCode: line.accountCode,
        });
      }
      totalDebit = totalDebit.add(debit);
      totalCredit = totalCredit.add(credit);
    }
    if (totalDebit.sub(totalCredit).abs().greaterThan(INTEGRITY_TOLERANCE)) {
      this.fail('UNBALANCED_ENTRY', 'Journal entry debit does not equal credit', {
        totalDebit: totalDebit.toFixed(4),
        totalCredit: totalCredit.toFixed(4),
        delta: totalDebit.sub(totalCredit).toFixed(4),
      });
    }
  }

  /**
   * Asserts no journal entry already exists for `sourceRef`. Use inside a
   * transaction before posting a NON-idempotent entry. (Idempotent
   * writers should instead rely on the unique `sourceRef` + return the
   * existing row; this guard is for paths that must hard-fail on a
   * duplicate.)
   */
  async assertNoDuplicatePosting(db: Db, sourceRef: string): Promise<void> {
    const existing = await db.journalEntry.findUnique({
      where: { sourceRef },
      select: { id: true },
    });
    if (existing) {
      this.fail('DUPLICATE_POSTING', 'A journal entry already exists for this reference', {
        sourceRef,
        existingEntryId: existing.id,
      });
    }
  }

  /**
   * Asserts a payment / settlement reference has not already been
   * settled. `settledSourceRef` is the deterministic journal sourceRef a
   * settlement would post under; if it already exists this is a double
   * settlement and must hard-fail.
   */
  async assertNotAlreadySettled(db: Db, settledSourceRef: string): Promise<void> {
    const existing = await db.journalEntry.findUnique({
      where: { sourceRef: settledSourceRef },
      select: { id: true },
    });
    if (existing) {
      this.fail('DOUBLE_SETTLEMENT', 'This payment/settlement has already been posted', {
        sourceRef: settledSourceRef,
        existingEntryId: existing.id,
      });
    }
  }

  /**
   * Asserts a reversal has not already been posted. `reversalSourceRef`
   * is the deterministic sourceRef the reversal entry posts under
   * (e.g. `JOURNAL:INVOICE_CANCELED:<orderId>`); a second reversal of the
   * same original is a double reversal and must hard-fail.
   */
  async assertNotAlreadyReversed(db: Db, reversalSourceRef: string): Promise<void> {
    const existing = await db.journalEntry.findUnique({
      where: { sourceRef: reversalSourceRef },
      select: { id: true },
    });
    if (existing) {
      this.fail('DOUBLE_REVERSAL', 'This entry has already been reversed', {
        sourceRef: reversalSourceRef,
        existingEntryId: existing.id,
      });
    }
  }

  /**
   * Asserts a computed balance is not invalidly negative. `allowNegative`
   * is provided for accounts that legitimately may go negative (e.g. an
   * over-refunded wallet during a controlled flow); the default is the
   * strict "balances must not go below zero" rule.
   */
  assertNonNegativeBalance(
    balance: Prisma.Decimal | string | number,
    context: Record<string, unknown> = {},
  ): void {
    const value = this.decimal(balance);
    if (value.lessThan(new Prisma.Decimal(0).sub(INTEGRITY_TOLERANCE))) {
      this.fail('NEGATIVE_BALANCE', 'Operation would produce an invalid negative balance', {
        ...context,
        balance: value.toFixed(4),
      });
    }
  }
}
