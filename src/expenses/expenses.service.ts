import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  CashStatus,
  DepositStatus,
  ExpenseCategory,
  ExpenseMethod,
  ExpenseStatus,
  GeneralLedgerEntryType,
  OrderStatus,
  PosPaymentMethod,
  Prisma,
  SafariRole,
} from '@prisma/client';
import { GeneralLedgerService } from '../general-ledger/general-ledger.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generalLedger: GeneralLedgerService,
  ) {}

  private assertCanRecordExpense(role: SafariRole): void {
    if (role !== SafariRole.MANAGER && role !== SafariRole.DRIVER) {
      throw new ForbiddenException('Only MANAGER or DRIVER can record expenses');
    }
  }

  private async computeDriverSpendableCash(
    tx: Prisma.TransactionClient,
    driverId: string,
  ): Promise<Prisma.Decimal> {
    const [cashSum, expSum, depSum] = await Promise.all([
      tx.order.aggregate({
        where: {
          driverId,
          status: OrderStatus.COMPLETED,
          cashStatus: CashStatus.PAID_TO_DRIVER,
          posPaymentMethod: PosPaymentMethod.CASH,
        },
        _sum: { totalPrice: true },
      }),
      tx.branchExpense.aggregate({
        where: {
          recordedById: driverId,
          status: { in: [ExpenseStatus.APPROVED, ExpenseStatus.AUDIT] },
        },
        _sum: { amount: true },
      }),
      tx.deposit.aggregate({
        where: { driverId, status: DepositStatus.PENDING },
        _sum: { amount: true },
      }),
    ]);
    const cash = new Prisma.Decimal(cashSum._sum.totalPrice?.toString() ?? '0');
    const exp = new Prisma.Decimal(expSum._sum.amount?.toString() ?? '0');
    const dep = new Prisma.Decimal(depSum._sum.amount?.toString() ?? '0');
    return cash.sub(exp).sub(dep);
  }

  async create(
    userId: string,
    safariRole: SafariRole,
    dto: {
      title: string;
      amount: number;
      category: ExpenseCategory;
      expenseMethod?: ExpenseMethod;
      note?: string;
      receiptUrl?: string;
    },
  ) {
    this.assertCanRecordExpense(safariRole);
    const method = dto.expenseMethod ?? ExpenseMethod.CASH;
    const amountDec = new Prisma.Decimal(Number(dto.amount).toFixed(4));

    return this.prisma.$transaction(async (tx) => {
      if (safariRole === SafariRole.DRIVER && method === ExpenseMethod.CASH) {
        const spendable = await this.computeDriverSpendableCash(tx, userId);
        if (amountDec.gt(spendable)) {
          throw new BadRequestException(
            'Insufficient driver field cash for a CASH expense (includes pending deposits).',
          );
        }
      }

      const u = await tx.user.findUnique({
        where: { id: userId },
        select: { branchId: true },
      });

      const row = await tx.branchExpense.create({
        data: {
          title: dto.title.trim(),
          amount: amountDec,
          category: dto.category,
          expenseMethod: method,
          status: ExpenseStatus.PENDING_ACCOUNTANT,
          note: dto.note?.trim() || null,
          receiptUrl: dto.receiptUrl?.trim() || null,
          recordedById: userId,
          branchId: u?.branchId ?? null,
        },
        include: {
          recordedBy: {
            select: { id: true, fullName: true, username: true },
          },
          branch: {
            select: { id: true, name: true },
          },
        },
      });

      const isDriver = safariRole === SafariRole.DRIVER;
      const driverWalletDelta =
        isDriver && method === ExpenseMethod.CASH ? amountDec.neg() : new Prisma.Decimal(0);
      const ownerRadarDelta =
        isDriver && method === ExpenseMethod.PREPAID_CARD ? amountDec.neg()
        : isDriver && method === ExpenseMethod.CASH ? amountDec.neg()
        : amountDec.neg();

      // A3.D7 — An expense is only an accounting liability once the
      // accountant approves it. Historically we posted the full amount on
      // CREATE, which made SUM(EXPENSE_RECORDED) include PENDING rows
      // while the Executive P&L only counts APPROVED. That silent drift
      // could overstate expenses on the Unified Ledger by tens of dinars
      // a day. The accrual row with the real amount is now emitted at
      // APPROVED time (see updateStatus); this CREATED marker stays at
      // zero so the row still appears on audit streams without
      // double-counting.
      await this.generalLedger.append(tx, {
        entryType: GeneralLedgerEntryType.EXPENSE_RECORDED,
        amount: 0,
        memo: `expense:created:${row.title}`,
        expenseId: row.id,
        actorUserId: userId,
        metadata: {
          event: 'CREATED',
          status: ExpenseStatus.PENDING_ACCOUNTANT,
          amountKd: amountDec.toString(),
          category: row.category,
          expenseMethod: method,
          safariRole,
          driverWalletDelta: driverWalletDelta.toString(),
          ownerProfitRadarDelta: ownerRadarDelta.toString(),
        },
      });

      return { ...row, receiptUrl: null };
    });
  }

  async listForUser(
    userId: string,
    safariRole: SafariRole,
    fromIso: string,
    toIso: string,
    branchId?: string,
    status?: ExpenseStatus,
  ) {
    if (
      safariRole !== SafariRole.MANAGER &&
      safariRole !== SafariRole.ACCOUNTANT &&
      safariRole !== SafariRole.OWNER &&
      safariRole !== SafariRole.GENERAL_MANAGER &&
      safariRole !== SafariRole.DRIVER
    ) {
      throw new ForbiddenException();
    }
    const from = new Date(fromIso);
    const to = new Date(toIso);
    const driverOwn: Prisma.BranchExpenseWhereInput =
      safariRole === SafariRole.DRIVER ? { recordedById: userId } : {};
    const rows = await this.prisma.branchExpense.findMany({
      where: {
        expenseDate: { gte: from, lte: to },
        ...(safariRole === SafariRole.DRIVER ? driverOwn : {}),
        ...(safariRole !== SafariRole.DRIVER && branchId ? { branchId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { expenseDate: 'desc' },
      include: {
        recordedBy: {
          select: { id: true, fullName: true, username: true },
        },
        branch: {
          select: { id: true, name: true },
        },
      },
    });
    // Receipt URLs: Financial-Island auditors (OWNER + GENERAL_MANAGER) can open
    // the uploaded photo to verify the expense. Everyone else receives null.
    const canSeeReceipt =
      safariRole === SafariRole.OWNER ||
      safariRole === SafariRole.GENERAL_MANAGER;
    return rows.map((row) => ({
      ...row,
      receiptUrl: canSeeReceipt ? row.receiptUrl : null,
    }));
  }

  async listPendingApproval(safariRole: SafariRole) {
    if (
      safariRole !== SafariRole.ACCOUNTANT &&
      safariRole !== SafariRole.OWNER &&
      safariRole !== SafariRole.GENERAL_MANAGER
    ) {
      throw new ForbiddenException();
    }
    return this.prisma.branchExpense.findMany({
      where: { status: ExpenseStatus.PENDING_ACCOUNTANT },
      orderBy: { expenseDate: 'desc' },
      include: {
        recordedBy: {
          select: { id: true, fullName: true, username: true },
        },
        branch: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async updateStatus(
    id: string,
    safariRole: SafariRole,
    status: ExpenseStatus,
    actorUserId: string,
  ) {
    if (
      safariRole !== SafariRole.ACCOUNTANT &&
      safariRole !== SafariRole.OWNER &&
      safariRole !== SafariRole.GENERAL_MANAGER
    ) {
      throw new ForbiddenException();
    }
    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.branchExpense.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!previous) {
        throw new BadRequestException('Expense not found');
      }
      const previousStatus = previous.status;

      const updated = await tx.branchExpense.update({
        where: { id },
        data: { status },
        include: {
          recordedBy: {
            select: { id: true, fullName: true, username: true },
          },
          branch: {
            select: { id: true, name: true },
          },
        },
      });

      // A3.D7 — Accrual booking is deferred to APPROVED so
      // SUM(EXPENSE_RECORDED) always matches Executive P&L exactly.
      // Transitions emit:
      //   PENDING → APPROVED   : +amount accrual
      //   APPROVED → REJECTED  : -amount reversal (in case we ever flip
      //                          after approval)
      //   APPROVED → AUDIT     : 0 (audit marker, amount stays booked)
      //   else                 : 0 (audit marker only)
      let ledgerAmount: Prisma.Decimal | number = 0;
      let event = 'STATUS_CHANGE';
      const wasApproved = previousStatus === ExpenseStatus.APPROVED;
      const becameApproved = status === ExpenseStatus.APPROVED;
      if (!wasApproved && becameApproved) {
        ledgerAmount = updated.amount;
        event = 'ACCRUAL';
      } else if (wasApproved && !becameApproved) {
        ledgerAmount = updated.amount.neg();
        event = 'REVERSAL';
      }

      await this.generalLedger.append(tx, {
        entryType: GeneralLedgerEntryType.EXPENSE_RECORDED,
        amount: ledgerAmount,
        memo: `expense:${status.toLowerCase()}`,
        expenseId: updated.id,
        actorUserId,
        metadata: {
          event,
          status,
          previousStatus,
          amountKd: updated.amount.toString(),
          category: updated.category,
          expenseMethod: updated.expenseMethod,
          branchId: updated.branchId,
        },
      });

      return updated;
    });
  }

  private branchWhere(
    branchId?: string,
  ): Pick<Prisma.BranchExpenseWhereInput, 'branchId'> | Record<string, never> {
    if (!branchId) return {};
    return { branchId };
  }

  async sumInRange(
    from: Date,
    to: Date,
    branchId?: string,
    recordedById?: string,
  ): Promise<string> {
    const agg = await this.prisma.branchExpense.aggregate({
      where: {
        expenseDate: { gte: from, lte: to },
        status: ExpenseStatus.APPROVED,
        ...this.branchWhere(branchId),
        ...(recordedById ? { recordedById } : {}),
      },
      _sum: { amount: true },
    });
    return agg._sum.amount !== null && agg._sum.amount !== undefined
      ? agg._sum.amount.toString()
      : '0';
  }

  async sumInRangeByCategories(
    from: Date,
    to: Date,
    categories: ExpenseCategory[],
    branchId?: string,
    recordedById?: string,
  ): Promise<string> {
    const agg = await this.prisma.branchExpense.aggregate({
      where: {
        expenseDate: { gte: from, lte: to },
        category: { in: categories },
        status: ExpenseStatus.APPROVED,
        ...this.branchWhere(branchId),
        ...(recordedById ? { recordedById } : {}),
      },
      _sum: { amount: true },
    });
    return agg._sum.amount !== null && agg._sum.amount !== undefined
      ? agg._sum.amount.toString()
      : '0';
  }
}
