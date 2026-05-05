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
import { assertInstitutionalMutationAllowed } from '../auth/institutional-mutation.util';
import type {
  ExpenseOwnerType,
  ExpensesSummaryAlertDto,
  ExpensesSummaryByBranchDto,
  ExpensesSummaryByCategoryDto,
  ExpensesSummaryByOwnerDto,
  ExpensesSummaryMonthlyDto,
  ExpensesSummaryResponseDto,
} from './dto/expenses-summary.dto';

/**
 * STRICT ROLE-BASED EXPENSE DESIGN — SSoT helpers.
 *
 * `deriveOwnerType` is the single function that decides whether a row
 * is BRANCH / DRIVER / COMPANY. Used by both the list-row projection
 * and the `/expenses-summary` aggregate so the same definition is used
 * everywhere — no two callers can disagree.
 */
export function deriveOwnerType(
  recordedByRole: SafariRole | null | undefined,
  branchId: string | null,
): ExpenseOwnerType {
  if (recordedByRole === SafariRole.DRIVER) return 'DRIVER';
  if (recordedByRole === SafariRole.MANAGER) return 'BRANCH';
  if (
    recordedByRole === SafariRole.OWNER ||
    recordedByRole === SafariRole.GENERAL_MANAGER ||
    recordedByRole === SafariRole.ACCOUNTANT
  ) {
    return 'COMPANY';
  }
  return branchId ? 'BRANCH' : 'COMPANY';
}

/**
 * STRICT ROLE-BASED EXPENSE DESIGN — Part 8 (safety rules).
 *
 * The brief asks us to "block vehicle expenses misuse" for branch
 * managers. `BranchExpense` does not actually have a VEHICLE category
 * (categories are SOAP / FUEL / MISC). The closest legitimate misuse
 * is a MANAGER recording a FUEL expense — fuel belongs to drivers
 * (their cars). MANAGERs may still record SOAP / MISC for the branch.
 *
 * Driver-side fuel expenses must be created by the DRIVER themselves
 * via the same endpoint (DRIVER role passes this check; their cash
 * spendability check is enforced separately by `ExpensesService.create`).
 */
export const DRIVER_ONLY_CATEGORIES: ReadonlySet<ExpenseCategory> = new Set([
  ExpenseCategory.FUEL,
]);

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

  /**
   * STRICT ROLE-BASED EXPENSE DESIGN — Part 8.
   *
   *   1. category must match the actor's role (MANAGER cannot post
   *      driver-side categories like FUEL — drivers must record their
   *      own fuel).
   *   2. ownership must be coherent: a MANAGER must have a branchId
   *      so the row attributes to a BRANCH owner.
   */
  private assertCategoryMatchesRole(
    role: SafariRole,
    category: ExpenseCategory,
  ): void {
    if (role === SafariRole.MANAGER && DRIVER_ONLY_CATEGORIES.has(category)) {
      throw new BadRequestException(
        `INVALID EXPENSE TYPE — category ${category} is driver-only; branch managers cannot record it.`,
      );
    }
  }

  private assertOwnershipCoherent(
    role: SafariRole,
    branchId: string | null,
  ): void {
    if (role === SafariRole.MANAGER && !branchId) {
      throw new BadRequestException(
        'EXPENSE MUST HAVE OWNER — branch manager has no branch attribution.',
      );
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
    this.assertCategoryMatchesRole(safariRole, dto.category);
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
      this.assertOwnershipCoherent(safariRole, u?.branchId ?? null);

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

      return {
        ...row,
        receiptUrl: null,
        ownerType: deriveOwnerType(safariRole, row.branchId),
      };
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
          select: { id: true, fullName: true, username: true, safariRole: true },
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
      ownerType: deriveOwnerType(row.recordedBy.safariRole, row.branchId),
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
    assertInstitutionalMutationAllowed(safariRole);
    if (
      safariRole !== SafariRole.ACCOUNTANT &&
      safariRole !== SafariRole.OWNER
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

  /**
   * STRICT ROLE-BASED EXPENSE DESIGN — Part 6 (SSoT).
   *
   * Single source of truth for every "total expense" displayed
   * anywhere in the product. The frontend MUST consume this endpoint
   * instead of running `reduce/sum/%` over `/api/expenses` rows.
   *
   * Restricted to OWNER, GENERAL_MANAGER and ACCOUNTANT (Part 7) so a
   * branch manager never receives company-wide aggregates. The
   * controller enforces the role check; this service treats the role
   * as already validated.
   */
  async summarize(
    fromIso: string,
    toIso: string,
    branchId?: string,
  ): Promise<ExpensesSummaryResponseDto> {
    const from = new Date(fromIso);
    const to = new Date(toIso);
    const branchFilter = branchId ? { branchId } : {};

    const rows = await this.prisma.branchExpense.findMany({
      where: {
        expenseDate: { gte: from, lte: to },
        ...branchFilter,
      },
      select: {
        amount: true,
        category: true,
        status: true,
        branchId: true,
        expenseDate: true,
        branch: { select: { name: true } },
        recordedBy: { select: { safariRole: true } },
      },
    });

    let totalApprovedKd = new Prisma.Decimal(0);
    let totalPendingKd = new Prisma.Decimal(0);
    let approvedCount = 0;

    const ownerTotals = new Map<ExpenseOwnerType, { kd: Prisma.Decimal; count: number }>();
    const categoryTotals = new Map<
      ExpenseCategory,
      { kd: Prisma.Decimal; count: number }
    >();
    const branchTotals = new Map<
      string,
      {
        branchId: string | null;
        branchName: string | null;
        kd: Prisma.Decimal;
        count: number;
      }
    >();
    const monthly = new Map<
      string,
      {
        total: Prisma.Decimal;
        driver: Prisma.Decimal;
        branch: Prisma.Decimal;
        company: Prisma.Decimal;
      }
    >();

    for (const row of rows) {
      const amount = row.amount;
      if (row.status === ExpenseStatus.APPROVED) {
        totalApprovedKd = totalApprovedKd.add(amount);
        approvedCount += 1;
      } else if (row.status === ExpenseStatus.PENDING_ACCOUNTANT) {
        totalPendingKd = totalPendingKd.add(amount);
      }
      // Drift / trend / breakdown buckets only count APPROVED rows so
      // SUM here matches Executive P&L (see A3.D7 note above).
      if (row.status !== ExpenseStatus.APPROVED) continue;

      const ownerType = deriveOwnerType(row.recordedBy.safariRole, row.branchId);
      const ownerSlot = ownerTotals.get(ownerType) ?? {
        kd: new Prisma.Decimal(0),
        count: 0,
      };
      ownerSlot.kd = ownerSlot.kd.add(amount);
      ownerSlot.count += 1;
      ownerTotals.set(ownerType, ownerSlot);

      const categorySlot = categoryTotals.get(row.category) ?? {
        kd: new Prisma.Decimal(0),
        count: 0,
      };
      categorySlot.kd = categorySlot.kd.add(amount);
      categorySlot.count += 1;
      categoryTotals.set(row.category, categorySlot);

      const branchKey = row.branchId ?? '__unattributed__';
      const branchSlot = branchTotals.get(branchKey) ?? {
        branchId: row.branchId ?? null,
        branchName: row.branch?.name ?? null,
        kd: new Prisma.Decimal(0),
        count: 0,
      };
      branchSlot.kd = branchSlot.kd.add(amount);
      branchSlot.count += 1;
      branchTotals.set(branchKey, branchSlot);

      const monthKey = row.expenseDate.toISOString().slice(0, 7);
      const monthSlot = monthly.get(monthKey) ?? {
        total: new Prisma.Decimal(0),
        driver: new Prisma.Decimal(0),
        branch: new Prisma.Decimal(0),
        company: new Prisma.Decimal(0),
      };
      monthSlot.total = monthSlot.total.add(amount);
      if (ownerType === 'DRIVER') monthSlot.driver = monthSlot.driver.add(amount);
      else if (ownerType === 'BRANCH') monthSlot.branch = monthSlot.branch.add(amount);
      else monthSlot.company = monthSlot.company.add(amount);
      monthly.set(monthKey, monthSlot);
    }

    const byOwnerType: ExpensesSummaryByOwnerDto[] = (
      ['DRIVER', 'BRANCH', 'COMPANY'] as ExpenseOwnerType[]
    ).map((ownerType) => {
      const slot = ownerTotals.get(ownerType);
      return {
        ownerType,
        totalKd: (slot?.kd ?? new Prisma.Decimal(0)).toFixed(4),
        count: slot?.count ?? 0,
      };
    });

    const byCategory: ExpensesSummaryByCategoryDto[] = [...categoryTotals.entries()]
      .map(([category, slot]) => ({
        category,
        totalKd: slot.kd.toFixed(4),
        count: slot.count,
      }))
      .sort((a, b) => Number(b.totalKd) - Number(a.totalKd));

    const byBranch: ExpensesSummaryByBranchDto[] = [...branchTotals.values()]
      .map((slot) => ({
        branchId: slot.branchId,
        branchName: slot.branchName,
        totalKd: slot.kd.toFixed(4),
        count: slot.count,
      }))
      .sort((a, b) => Number(b.totalKd) - Number(a.totalKd));

    const monthlyOut: ExpensesSummaryMonthlyDto[] = [...monthly.entries()]
      .map(([month, slot]) => ({
        month,
        totalKd: slot.total.toFixed(4),
        driverKd: slot.driver.toFixed(4),
        branchKd: slot.branch.toFixed(4),
        companyKd: slot.company.toFixed(4),
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const alerts = this.buildSummaryAlerts(monthlyOut, totalApprovedKd);

    return {
      source: 'api/finance/expenses-summary',
      rangeFromIso: from.toISOString(),
      rangeToIso: to.toISOString(),
      branchScope: branchId ?? null,
      totalApprovedKd: totalApprovedKd.toFixed(4),
      totalPendingKd: totalPendingKd.toFixed(4),
      approvedCount,
      byOwnerType,
      byCategory,
      byBranch,
      monthly: monthlyOut,
      alerts,
    };
  }

  /**
   * Server-side trend/spike detection — replaces the frontend
   * `expense-insights.ts` heuristics so dashboards never recompute
   * percentages client-side.
   */
  private buildSummaryAlerts(
    monthly: ExpensesSummaryMonthlyDto[],
    totalApproved: Prisma.Decimal,
  ): ExpensesSummaryAlertDto[] {
    const alerts: ExpensesSummaryAlertDto[] = [];
    if (monthly.length >= 2) {
      const last = monthly[monthly.length - 1];
      const prev = monthly[monthly.length - 2];
      const lastTotal = new Prisma.Decimal(last.totalKd);
      const prevTotal = new Prisma.Decimal(prev.totalKd);
      if (prevTotal.gt(0)) {
        const growth = lastTotal.sub(prevTotal).div(prevTotal);
        if (growth.gt(0.75)) {
          alerts.push({
            id: 'expenses-monthly-spike',
            severity: 'critical',
            message: `Monthly expenses spiked +${growth.mul(100).toFixed(0)}% (${prev.month} → ${last.month}).`,
          });
        } else if (growth.gt(0.3)) {
          alerts.push({
            id: 'expenses-monthly-growth',
            severity: 'warning',
            message: `Monthly expenses grew +${growth.mul(100).toFixed(0)}% (${prev.month} → ${last.month}).`,
          });
        } else if (growth.lt(-0.5)) {
          alerts.push({
            id: 'expenses-monthly-drop',
            severity: 'info',
            message: `Monthly expenses dropped ${growth.mul(100).toFixed(0)}% (${prev.month} → ${last.month}).`,
          });
        }
      }
    }
    if (totalApproved.lte(0)) {
      alerts.push({
        id: 'expenses-empty-window',
        severity: 'info',
        message: 'No approved expenses in the selected window.',
      });
    }
    return alerts;
  }
}
