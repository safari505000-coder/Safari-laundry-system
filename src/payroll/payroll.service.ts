import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PayrollStatus, Prisma, SafariRole } from '@prisma/client';
import { CommissionPayoutsService } from '../commissions/commission-payouts.service';
import { DebtHoldsService } from '../debt-holds/debt-holds.service';
import { LoansService } from '../loans/loans.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * V19.20 — net pay math. Commission + debt-release are additions;
 * deductions, debt-hold, AND the booked monthly loan instalment are
 * subtractions.
 *
 *   net = basic + allowances + commission + debtRelease
 *         − deductions − debtHold − loanDeduction
 */
function netPay(row: {
  basicSalary: Prisma.Decimal;
  allowances: Prisma.Decimal;
  deductions: Prisma.Decimal;
  commissionAmount?: Prisma.Decimal | null;
  debtHoldAmount?: Prisma.Decimal | null;
  debtReleaseAmount?: Prisma.Decimal | null;
  loanDeduction?: Prisma.Decimal | null;
}): Prisma.Decimal {
  const commission = row.commissionAmount ?? new Prisma.Decimal(0);
  const hold = row.debtHoldAmount ?? new Prisma.Decimal(0);
  const release = row.debtReleaseAmount ?? new Prisma.Decimal(0);
  const loan = row.loanDeduction ?? new Prisma.Decimal(0);
  return row.basicSalary
    .add(row.allowances)
    .add(commission)
    .add(release)
    .sub(row.deductions)
    .sub(hold)
    .sub(loan);
}

/**
 * V19.20 — derive the idempotency key "YYYY-MM" used by the loan
 * booking helper. The `paymentDate` is the authoritative source for
 * which pay-month this row represents, so we anchor to it (UTC slice
 * to stay stable across tz hops).
 */
function yearMonthOf(d: Date): string {
  return d.toISOString().slice(0, 7);
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commissionPayouts: CommissionPayoutsService,
    private readonly debtHolds: DebtHoldsService,
    private readonly loans: LoansService,
  ) {}

  private assertOwnerOrManager(role: SafariRole): void {
    if (role !== SafariRole.OWNER && role !== SafariRole.MANAGER) {
      throw new ForbiddenException();
    }
  }

  async create(
    actorRole: SafariRole,
    dto: {
      userId: string;
      branchId: string;
      basicSalary: number;
      allowances?: number;
      deductions?: number;
      paymentDate: string;
    },
  ) {
    this.assertOwnerOrManager(actorRole);
    const basic = new Prisma.Decimal(dto.basicSalary.toFixed(4));
    const allow = new Prisma.Decimal((dto.allowances ?? 0).toFixed(4));
    const manualDed = new Prisma.Decimal((dto.deductions ?? 0).toFixed(4));

    // V19.20 — loans are BACK on the payslip (Owner's latest ask:
    // "يختار جدول الاقساط من شهر الي 12 شهر وتذكر خصم القسط في مسيرة
    // الرواتب") but SAFELY: the monthly instalment is booked via
    // `LoansService.bookPayrollInstalmentsFor`, which observes each
    // loan's `lastDeductionYearMonth` and refuses to take the same
    // YYYY-MM twice. Re-running April's payroll after a fix therefore
    // produces `loanDeduction = 0` on the replay — fixing the V19.18
    // double-deduction bug without hiding the line from the employee.
    // `deductions` still holds only the manual figure the approver
    // typed; `loanDeduction` is its own band.
    //
    // V19.16 — we still run three ledgers inside the same transaction:
    //   1. Commission: sum of RELEASED CommissionPayouts up to cut time
    //      flows into `commissionAmount`; the matching rows are stamped
    //      PAID + payrollId before we return so replaying the cut
    //      cannot double-pay.
    //   2. Debt-hold release: any previously-HELD DebtHold whose
    //      underlying customer debt is now cleared is marked RELEASED
    //      (amount is exposed via the Debt Holds page — NOT added to
    //      this payroll row).
    //   3. Debt-hold snapshot: if the policy is ACTIVE and the employee
    //      still has open customer debt, a fresh HELD slip is persisted
    //      and reflected in `debtHoldAmount` (negative line).
    const paymentDate = new Date(dto.paymentDate);
    const yearMonth = yearMonthOf(paymentDate);
    return this.prisma.$transaction(async (tx) => {
      const totalDed = manualDed;

      // V19.20 — book the scheduled loan instalment for this pay
      // month. Idempotent via EmployeeLoan.lastDeductionYearMonth so a
      // re-run of the same month returns 0. Runs BEFORE the payroll
      // row is created so we can persist the figure on it.
      const loanDeduction = await this.loans.bookPayrollInstalmentsFor(
        dto.userId,
        yearMonth,
        tx,
      );

      // V19.16 — commission roll-up: pull RELEASED payouts earned up to
      // this cut date. We read them here BEFORE creating the payroll row
      // so we know the total in advance; the mark-paid update runs after
      // the row exists so we can stamp the correct `payrollId`.
      const commissionSnapshot =
        await this.commissionPayouts.sumReleasedForUser(
          dto.userId,
          paymentDate,
        );
      const commission = new Prisma.Decimal(commissionSnapshot.sumKd);

      // V19.17 — auto-flip HELD→RELEASED for any slips whose underlying
      // customer debt has been collected. We still call this so statuses
      // stay accurate, but the returned amount is NO LONGER bundled into
      // the payroll. Release is now a voucher-style disbursement handled
      // by `DebtHoldsService.markDisbursed` from the Debt-Holds page,
      // matching the Owner workflow (salary pays out first; release is
      // stamped on its own schedule).
      await this.debtHolds.releaseSettledHolds(dto.userId, tx);
      const debtRelease = new Prisma.Decimal(0);

      // V19.16 — fresh debt-hold for the current open customer debt.
      const newHoldSnap = await this.debtHolds.buildHoldSnapshotForPayroll(
        dto.userId,
      );
      const autoHold = newHoldSnap
        ? newHoldSnap.holdAmount
        : new Prisma.Decimal(0);

      // V19.17 — absorb any pending manual (unlinked) HELD slips for
      // this employee. These were created via the "حجز يدوي" dialog
      // before the payroll existed; we fold their sum into
      // `debtHoldAmount` and stamp each row with the new payroll id so
      // the saved payslip reflects the actual deduction instead of
      // showing "—" while the ledger silently withholds the cash.
      const untiedHolds = await tx.debtHold.findMany({
        where: {
          employeeUserId: dto.userId,
          status: 'HELD',
          payrollId: null,
        },
        select: { id: true, holdAmount: true },
      });
      const untiedSum = untiedHolds.reduce(
        (acc, h) => acc.add(new Prisma.Decimal(h.holdAmount.toString())),
        new Prisma.Decimal(0),
      );
      const debtHold = autoHold.add(untiedSum);

      const payroll = await tx.payroll.create({
        data: {
          userId: dto.userId,
          branchId: dto.branchId,
          basicSalary: basic,
          allowances: allow,
          deductions: totalDed,
          commissionAmount: commission.toFixed(4),
          debtHoldAmount: debtHold.toFixed(4),
          debtReleaseAmount: debtRelease.toFixed(4),
          loanDeduction: loanDeduction.toFixed(4),
          paymentDate,
          status: PayrollStatus.PENDING,
        },
        include: {
          user: { select: { id: true, fullName: true, username: true } },
          branch: { select: { id: true, name: true } },
        },
      });

      // Stamp matched commission rows as PAID on this payroll id. This
      // runs after the Payroll row exists so the foreign key is valid.
      if (commissionSnapshot.payoutIds.length > 0) {
        await this.commissionPayouts.markPaidForPayroll(
          commissionSnapshot.payoutIds,
          payroll.id,
          tx,
        );
      }

      // Persist the fresh auto-hold slip tied to this payroll (if any).
      if (newHoldSnap) {
        await this.debtHolds.persistHold(
          {
            employeeUserId: dto.userId,
            payrollId: payroll.id,
            debtAmount: newHoldSnap.debtAmount,
            holdAmount: newHoldSnap.holdAmount,
            holdMode: newHoldSnap.holdMode,
          },
          tx,
        );
      }

      // Link every absorbed manual hold to the new payroll so the
      // payslip audit trail points back to exactly which holds were
      // applied this run. Batched update keeps this O(1) round trip.
      if (untiedHolds.length > 0) {
        await tx.debtHold.updateMany({
          where: { id: { in: untiedHolds.map((h) => h.id) } },
          data: { payrollId: payroll.id },
        });
      }

      return payroll;
    });
  }

  /**
   * V19.20 — safe loan backfill for a single PENDING payroll row.
   *
   * Pre-V19.20 payrolls were created before the loan→payroll hook
   * existed, so they carry `loanDeduction = 0` even for employees
   * with ACTIVE loans. Rather than force the Owner to delete and
   * recreate (which would also blow away commission stamps and the
   * debt-hold snapshot), this endpoint pulls the missed instalment
   * in via `recalcUnbookedInstalmentsFor` — which only touches loans
   * whose `lastDeductionYearMonth IS NULL`. The returned Decimal is
   * ADDED to the existing `loanDeduction` so repeated clicks are a
   * no-op (the first click stamps the high-water mark, subsequent
   * clicks find nothing to book).
   *
   * Guard rails:
   *   - PENDING only. PAID payrolls are immutable — the cash has
   *     already left the company, the payslip is printed and signed.
   *   - OWNER / GM / MANAGER (same set as `create`) — payroll
   *     actions carry the same trust boundary as creating the row.
   */
  async recalcLoanDeduction(actorRole: SafariRole, id: string) {
    this.assertOwnerOrManager(actorRole);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.payroll.findUnique({ where: { id } });
      if (!row) throw new NotFoundException('Payroll not found');
      if (row.status !== PayrollStatus.PENDING) {
        throw new ForbiddenException(
          'Only PENDING payrolls can be recalculated',
        );
      }
      const yearMonth = yearMonthOf(row.paymentDate);
      const newlyBooked = await this.loans.recalcUnbookedInstalmentsFor(
        row.userId,
        yearMonth,
        tx,
      );
      if (newlyBooked.lte(0)) {
        // Nothing to book — return the row as-is so the UI can
        // surface a neutral "no missing instalments" message.
        return tx.payroll.findUniqueOrThrow({
          where: { id },
          include: {
            user: { select: { id: true, fullName: true, username: true } },
            branch: { select: { id: true, name: true } },
          },
        });
      }
      const nextLoan = row.loanDeduction.add(newlyBooked);
      return tx.payroll.update({
        where: { id },
        data: { loanDeduction: nextLoan },
        include: {
          user: { select: { id: true, fullName: true, username: true } },
          branch: { select: { id: true, name: true } },
        },
      });
    });
  }

  async markPaid(actorRole: SafariRole, id: string) {
    this.assertOwnerOrManager(actorRole);
    const row = await this.prisma.payroll.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Payroll not found');
    return this.prisma.payroll.update({
      where: { id },
      data: { status: PayrollStatus.PAID, paymentDate: new Date() },
      include: {
        user: { select: { id: true, fullName: true, username: true } },
        branch: { select: { id: true, name: true } },
      },
    });
  }

  async list(
    actorRole: SafariRole,
    fromIso: string,
    toIso: string,
    branchId?: string,
  ) {
    if (
      actorRole !== SafariRole.OWNER &&
      actorRole !== SafariRole.GENERAL_MANAGER &&
      actorRole !== SafariRole.MANAGER &&
      actorRole !== SafariRole.ACCOUNTANT
    ) {
      throw new ForbiddenException();
    }
    const from = new Date(fromIso);
    const to = new Date(toIso);
    return this.prisma.payroll.findMany({
      where: {
        paymentDate: { gte: from, lte: to },
        ...(branchId ? { branchId } : {}),
      },
      orderBy: { paymentDate: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            username: true,
            payrollRosterLineOrder: true,
            bankIban: true,
          },
        },
        branch: {
          select: { id: true, name: true, payrollRosterSortOrder: true },
        },
      },
    });
  }

  /**
   * Fetch a single payroll row with user + branch details, used by the
   * A4 printable payslip page. OWNER / GM / MANAGER / ACCOUNTANT may
   * fetch any row; employees may only fetch their own.
   */
  async findOne(actorRole: SafariRole, actorUserId: string, id: string) {
    const row = await this.prisma.payroll.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            username: true,
            employeeId: true,
            civilId: true,
            nationality: true,
            address: true,
            bankName: true,
            bankIban: true,
            hireDate: true,
            jobTitle: true,
          },
        },
        branch: { select: { id: true, name: true, location: true } },
      },
    });
    if (!row) throw new NotFoundException('Payroll not found');
    const canReadAll =
      actorRole === SafariRole.OWNER ||
      actorRole === SafariRole.GENERAL_MANAGER ||
      actorRole === SafariRole.MANAGER ||
      actorRole === SafariRole.ACCOUNTANT;
    if (!canReadAll && row.userId !== actorUserId) {
      throw new ForbiddenException();
    }
    return row;
  }

  /** Sum of net pay for PAID payrolls with paymentDate in [from, to]. */
  async sumPaidNetInRange(
    from: Date,
    to: Date,
    branchId?: string,
  ): Promise<string> {
    const rows = await this.prisma.payroll.findMany({
      where: {
        status: PayrollStatus.PAID,
        paymentDate: { gte: from, lte: to },
        ...(branchId ? { branchId } : {}),
      },
      select: {
        basicSalary: true,
        allowances: true,
        deductions: true,
        commissionAmount: true,
        debtHoldAmount: true,
        debtReleaseAmount: true,
        loanDeduction: true,
      },
    });
    let total = new Prisma.Decimal(0);
    for (const r of rows) {
      total = total.add(netPay(r));
    }
    return total.toFixed(4);
  }

  /** V19.28 — manual roster rows for external beneficiaries (read: same as payroll list). */
  async listAdHocLines(
    actorRole: SafariRole,
    periodYm: string,
    branchId?: string,
  ) {
    if (
      actorRole !== SafariRole.OWNER &&
      actorRole !== SafariRole.GENERAL_MANAGER &&
      actorRole !== SafariRole.MANAGER &&
      actorRole !== SafariRole.ACCOUNTANT
    ) {
      throw new ForbiddenException();
    }
    if (!/^\d{4}-\d{2}$/.test(periodYm)) {
      throw new BadRequestException('Invalid ym');
    }
    return this.prisma.payrollAdHocLine.findMany({
      where: {
        periodYm,
        ...(branchId ? { branchId } : {}),
      },
      orderBy: [{ branchId: 'asc' }, { lineSort: 'asc' }, { createdAt: 'asc' }],
      include: {
        branch: { select: { id: true, name: true } },
      },
    });
  }

  async createAdHocLine(
    actorRole: SafariRole,
    dto: {
      branchId: string;
      periodYm: string;
      beneficiaryName: string;
      bankName?: string | null;
      bankIban?: string | null;
      basicSalary: number;
      allowances?: number;
      deductions?: number;
      lineSort?: number;
      note?: string | null;
    },
  ) {
    this.assertOwnerOrManager(actorRole);
    if (!/^\d{4}-\d{2}$/.test(dto.periodYm)) {
      throw new BadRequestException('Invalid periodYm');
    }
    const iban = dto.bankIban?.replace(/\s/g, '').trim();
    const bankName = dto.bankName?.trim();
    return this.prisma.payrollAdHocLine.create({
      data: {
        branchId: dto.branchId,
        periodYm: dto.periodYm,
        lineSort: dto.lineSort ?? 0,
        beneficiaryName: dto.beneficiaryName.trim(),
        bankName: bankName && bankName.length > 0 ? bankName : null,
        bankIban: iban && iban.length > 0 ? iban : null,
        basicSalary: new Prisma.Decimal(dto.basicSalary.toFixed(4)),
        allowances: new Prisma.Decimal((dto.allowances ?? 0).toFixed(4)),
        deductions: new Prisma.Decimal((dto.deductions ?? 0).toFixed(4)),
        note: dto.note?.trim() || null,
      },
      include: {
        branch: { select: { id: true, name: true } },
      },
    });
  }

  async updateAdHocLine(
    actorRole: SafariRole,
    id: string,
    dto: {
      beneficiaryName?: string;
      bankName?: string | null;
      bankIban?: string | null;
      basicSalary?: number;
      allowances?: number;
      deductions?: number;
      lineSort?: number;
      note?: string | null;
    },
  ) {
    this.assertOwnerOrManager(actorRole);
    const existing = await this.prisma.payrollAdHocLine.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Ad-hoc line not found');
    const data: Prisma.PayrollAdHocLineUpdateInput = {};
    if (dto.beneficiaryName !== undefined) {
      data.beneficiaryName = dto.beneficiaryName.trim();
    }
    if (dto.bankName !== undefined) {
      const v = dto.bankName?.trim();
      data.bankName = v && v.length > 0 ? v : null;
    }
    if (dto.bankIban !== undefined) {
      const raw = dto.bankIban?.replace(/\s/g, '').trim();
      data.bankIban = raw && raw.length > 0 ? raw : null;
    }
    if (dto.basicSalary !== undefined) {
      data.basicSalary = new Prisma.Decimal(dto.basicSalary.toFixed(4));
    }
    if (dto.allowances !== undefined) {
      data.allowances = new Prisma.Decimal(dto.allowances.toFixed(4));
    }
    if (dto.deductions !== undefined) {
      data.deductions = new Prisma.Decimal(dto.deductions.toFixed(4));
    }
    if (dto.lineSort !== undefined) {
      data.lineSort = dto.lineSort;
    }
    if (dto.note !== undefined) {
      data.note = dto.note?.trim() || null;
    }
    return this.prisma.payrollAdHocLine.update({
      where: { id },
      data,
      include: {
        branch: { select: { id: true, name: true } },
      },
    });
  }

  async deleteAdHocLine(actorRole: SafariRole, id: string) {
    this.assertOwnerOrManager(actorRole);
    try {
      await this.prisma.payrollAdHocLine.delete({ where: { id } });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException('Ad-hoc line not found');
      }
      throw e;
    }
    return { id, deleted: true };
  }
}
