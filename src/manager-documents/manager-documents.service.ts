import { Injectable } from '@nestjs/common';
import {
  ExpenseStatus,
  ManagerCashCustodyStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * V19.22.5 — Branch Manager "My Documents" island.
 *
 * Surfaces every Accountant-approved document belonging to the
 * signed-in manager (or their branch) as a single printable feed:
 *   - CUSTODY_RECEIPT  — ManagerCashCustody bags with status
 *     `VERIFIED` (the Accountant already audited and signed off
 *     the deposit slip; the row below is therefore the manager's
 *     official receipt for the cash they handed over).
 *   - EXPENSE_VOUCHER  — BranchExpense rows with status `APPROVED`
 *     that are attached to the manager's branch. Managers submit
 *     ordinary operating expenses on behalf of their branch; once
 *     the Accountant approves, the branch needs a printable voucher
 *     to file in the binder.
 *
 * The two streams are merged, sorted desc by `date`, and returned
 * as a single list so the UI can render one chronological feed with
 * a print action per row.
 */
export type ManagerDocumentKind = 'CUSTODY_RECEIPT' | 'EXPENSE_VOUCHER';

export type ManagerDocumentRow = {
  kind: ManagerDocumentKind;
  id: string;
  /** ISO-8601 — the semantic "document date" to sort + display. */
  date: string;
  /** KWD amount as a decimal string (3-decimal KD standard). */
  amountKd: string;
  /** Short Arabic-first title; UI may translate further on its side. */
  title: string;
  /** Free-text subtitle: branch name, counter-party, or category. */
  subtitle: string | null;
  /** Raw status enum from the source table, for badge rendering. */
  status: string;
  /**
   * Frontend path to the printable voucher. The FE just navigates
   * to this path; each kind has its own dedicated print page.
   */
  printPath: string;
};

@Injectable()
export class ManagerDocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForManager(
    managerId: string,
    branchId: string | null,
  ): Promise<ManagerDocumentRow[]> {
    const verifiedBags = await this.prisma.managerCashCustody.findMany({
      where: {
        managerId,
        status: ManagerCashCustodyStatus.VERIFIED,
      },
      select: {
        id: true,
        amountKd: true,
        verifiedAt: true,
        receivedFromDriverAt: true,
        status: true,
        branch: { select: { name: true } },
        driver: { select: { fullName: true } },
      },
      orderBy: { verifiedAt: 'desc' },
      take: 200,
    });

    // BranchExpense has optional branchId; surface rows where
    //   (a) this manager was the submitter, OR
    //   (b) the expense was booked on this manager's branch.
    // That matches the operational reality where a supervisor on
    // behalf of the branch may also enter an expense for the file.
    const branchExpenseWhere: Prisma.BranchExpenseWhereInput = {
      status: ExpenseStatus.APPROVED,
      OR: [
        { recordedById: managerId },
        ...(branchId ? [{ branchId }] : []),
      ],
    };
    // `BranchExpense` doesn't carry a dedicated `approvedAt` column —
    // `updatedAt` is a faithful proxy because the APPROVED status is
    // terminal for the happy path (an APPROVED row is not mutated
    // again unless the Accountant rolls it back to AUDIT, which is
    // rare and still produces a sensible recency).
    const approvedExpenses = await this.prisma.branchExpense.findMany({
      where: branchExpenseWhere,
      select: {
        id: true,
        title: true,
        amount: true,
        category: true,
        note: true,
        expenseDate: true,
        updatedAt: true,
        status: true,
        branch: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    const custodyRows: ManagerDocumentRow[] = verifiedBags.map((b) => ({
      kind: 'CUSTODY_RECEIPT',
      id: b.id,
      date: (b.verifiedAt ?? b.receivedFromDriverAt).toISOString(),
      amountKd: b.amountKd.toString(),
      title: 'سند استلام عهدة نقدية',
      subtitle:
        [b.branch?.name, b.driver?.fullName].filter(Boolean).join(' · ') ||
        null,
      status: b.status,
      printPath: `/my-cash-receipts/${b.id}/print`,
    }));

    const expenseRows: ManagerDocumentRow[] = approvedExpenses.map((e) => ({
      kind: 'EXPENSE_VOUCHER',
      id: e.id,
      date: (e.updatedAt ?? e.expenseDate).toISOString(),
      amountKd: e.amount.toString(),
      title: e.title || 'سند مصروف معتمد',
      subtitle:
        [e.branch?.name, e.category, e.note].filter(Boolean).join(' · ') ||
        null,
      status: e.status,
      printPath: `/my-documents/expense/${e.id}/print`,
    }));

    return [...custodyRows, ...expenseRows].sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
    );
  }

  /**
   * V19.22.5 — Single-row fetch for the expense-voucher print page.
   *
   * The route is restricted to the submitter OR any manager of the
   * expense's branch (same rule as the list endpoint); both are
   * enforced on the controller via the role-guard and this method
   * asserts ownership via `where` so the FE can't print another
   * manager's expense.
   */
  async getExpenseVoucherForManager(
    expenseId: string,
    managerId: string,
    branchId: string | null,
  ) {
    const row = await this.prisma.branchExpense.findFirst({
      where: {
        id: expenseId,
        status: ExpenseStatus.APPROVED,
        OR: [
          { recordedById: managerId },
          ...(branchId ? [{ branchId }] : []),
        ],
      },
      include: {
        recordedBy: {
          select: { id: true, fullName: true, username: true },
        },
        branch: { select: { id: true, name: true } },
      },
    });
    return row;
  }
}
