import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LoanStatus, Prisma, SafariRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateLoanDto } from './dto/create-loan.dto';
import type { ListLoansQueryDto } from './dto/list-loans-query.dto';

const LOAN_INCLUDE = {
  user: {
    select: {
      id: true,
      fullName: true,
      username: true,
      employeeId: true,
      civilId: true,
      jobTitle: true,
      branch: { select: { id: true, name: true } },
    },
  },
  approvedBy: {
    select: { id: true, fullName: true, username: true },
  },
} satisfies Prisma.EmployeeLoanInclude;

export type LoanRow = Prisma.EmployeeLoanGetPayload<{
  include: typeof LOAN_INCLUDE;
}>;

function canSeeAllLoans(role: SafariRole): boolean {
  return (
    role === SafariRole.OWNER ||
    role === SafariRole.GENERAL_MANAGER ||
    role === SafariRole.ACCOUNTANT
  );
}

function canApproveLoan(role: SafariRole): boolean {
  return role === SafariRole.OWNER || role === SafariRole.ACCOUNTANT;
}

/**
 * Stage-D employee loans service.
 *
 * Workflow: PENDING → APPROVED (or REJECTED). On approve, `status`
 * moves to ACTIVE automatically so payroll deductions start. SETTLED
 * is set when `remaining` reaches zero (done by PayrollService once
 * §D.5 is wired). Employees may request on their own behalf;
 * approvers may raise loans for any employee.
 */
@Injectable()
export class LoansService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    actorRole: SafariRole,
    actorUserId: string,
    dto: CreateLoanDto,
  ): Promise<LoanRow> {
    // V19.20 — enforce the 1..12 schedule at the service layer too;
    // DTO validation is the primary gate but this keeps the invariant
    // if the service is ever invoked outside the HTTP pipeline (jobs,
    // seeds, tests).
    if (
      !Number.isInteger(dto.installmentCount) ||
      dto.installmentCount < 1 ||
      dto.installmentCount > 12
    ) {
      throw new BadRequestException(
        'installmentCount must be an integer between 1 and 12',
      );
    }
    const amount = new Prisma.Decimal(dto.amount.toFixed(4));
    const monthly = amount.div(dto.installmentCount).toDecimalPlaces(4);
    const targetUserId = canApproveLoan(actorRole)
      ? dto.userId ?? actorUserId
      : actorUserId;
    return this.prisma.employeeLoan.create({
      data: {
        userId: targetUserId,
        amount,
        installmentCount: dto.installmentCount,
        monthlyDeduction: monthly,
        remaining: amount,
        reason: dto.reason ?? null,
        status: LoanStatus.PENDING,
      },
      include: LOAN_INCLUDE,
    });
  }

  async list(
    actorRole: SafariRole,
    actorUserId: string,
    q: ListLoansQueryDto,
  ): Promise<LoanRow[]> {
    const where: Prisma.EmployeeLoanWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.userId ? { userId: q.userId } : {}),
    };
    if (!canSeeAllLoans(actorRole)) {
      where.userId = actorUserId;
    }
    return this.prisma.employeeLoan.findMany({
      where,
      include: LOAN_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async listMine(actorUserId: string): Promise<LoanRow[]> {
    return this.prisma.employeeLoan.findMany({
      where: { userId: actorUserId },
      include: LOAN_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(
    actorRole: SafariRole,
    actorUserId: string,
    id: string,
  ): Promise<LoanRow> {
    const row = await this.prisma.employeeLoan.findUnique({
      where: { id },
      include: LOAN_INCLUDE,
    });
    if (!row) throw new NotFoundException('Loan not found');
    if (!canSeeAllLoans(actorRole) && row.userId !== actorUserId) {
      throw new ForbiddenException();
    }
    return row;
  }

  async approve(
    actorRole: SafariRole,
    actorUserId: string,
    id: string,
  ): Promise<LoanRow> {
    if (!canApproveLoan(actorRole)) throw new ForbiddenException();
    const current = await this.prisma.employeeLoan.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException('Loan not found');
    if (current.status !== LoanStatus.PENDING) {
      throw new BadRequestException('Only PENDING loans can be approved');
    }
    return this.prisma.employeeLoan.update({
      where: { id },
      data: {
        status: LoanStatus.ACTIVE,
        approvedById: actorUserId,
        approvedAt: new Date(),
      },
      include: LOAN_INCLUDE,
    });
  }

  async reject(
    actorRole: SafariRole,
    actorUserId: string,
    id: string,
    reason: string,
  ): Promise<LoanRow> {
    if (!canApproveLoan(actorRole)) throw new ForbiddenException();
    const current = await this.prisma.employeeLoan.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException('Loan not found');
    if (current.status !== LoanStatus.PENDING) {
      throw new BadRequestException('Only PENDING loans can be rejected');
    }
    return this.prisma.employeeLoan.update({
      where: { id },
      data: {
        status: LoanStatus.REJECTED,
        approvedById: actorUserId,
        approvedAt: new Date(),
        rejectedReason: reason,
      },
      include: LOAN_INCLUDE,
    });
  }

  /**
   * V19.19 — manual loan deduction by OWNER only (GM read-only oversight).
   */
  async deductManual(
    actorRole: SafariRole,
    loanId: string,
    amountKd: number,
    note?: string,
  ): Promise<LoanRow> {
    if (actorRole !== SafariRole.OWNER) {
      throw new ForbiddenException(
        'Manual loan deductions are restricted to OWNER.',
      );
    }
    if (!Number.isFinite(amountKd) || amountKd <= 0) {
      throw new BadRequestException('Amount must be a positive number');
    }
    const requested = new Prisma.Decimal(amountKd.toFixed(4));

    return this.prisma.$transaction(async (tx) => {
      const loan = await tx.employeeLoan.findUnique({ where: { id: loanId } });
      if (!loan) throw new NotFoundException('Loan not found');
      if (loan.status !== LoanStatus.ACTIVE) {
        throw new BadRequestException(
          'Only ACTIVE loans can be deducted manually',
        );
      }
      const deduction = Prisma.Decimal.min(requested, loan.remaining);
      if (deduction.lte(0)) {
        throw new BadRequestException('Loan already settled');
      }
      const nextRemaining = loan.remaining.sub(deduction);
      const nextStatus = nextRemaining.lte(0)
        ? LoanStatus.SETTLED
        : loan.status;

      // We keep a lightweight trail inside `rejectedReason` would be
      // confusing; instead we append a dated note to `reason` so the
      // approver can see what was paid manually without a new table.
      // Example: "original reason\n\n[2026-04-23] خصم يدوي 12.500 KD — cash"
      const trailLine = `\n\n[${new Date().toISOString().slice(0, 10)}] خصم يدوي ${deduction.toFixed(
        3,
      )} د.ك${note ? ` — ${note.slice(0, 200)}` : ''}`;
      const nextReason = (loan.reason ?? '') + trailLine;

      return tx.employeeLoan.update({
        where: { id: loan.id },
        data: {
          remaining: nextRemaining,
          status: nextStatus,
          reason: nextReason,
        },
        include: LOAN_INCLUDE,
      });
    });
  }

  /**
   * V19.20 — book the scheduled instalment(s) for a single employee
   * inside an on-going payroll transaction.
   *
   * Called from `PayrollService.create` for every payroll row. The
   * user requested ("يختار جدول الاقساط من شهر الي 12 شهر وتذكر خصم
   * القسط في مسيرة الرواتب") that the monthly instalment reappears
   * as a deducted line on the payslip — but this MUST NOT re-trigger
   * the V19.19 double-deduction bug if the same month's payroll is
   * re-run. Idempotency is enforced by comparing the target
   * `yearMonth` (YYYY-MM, derived from `paymentDate`) against
   * `EmployeeLoan.lastDeductionYearMonth`:
   *
   *   - Same yearMonth  → skip (the instalment was already consumed).
   *   - Different / NULL → deduct `monthlyDeduction` (clamped to
   *                        `remaining`), flip to SETTLED at zero, and
   *                        stamp `lastDeductionYearMonth = yearMonth`.
   *
   * Returns the **Decimal sum** actually deducted this run so the
   * payroll row can persist it as `loanDeduction` and show it on the
   * payslip. The sum is capped at the aggregate remaining balances,
   * so partial final instalments always reconcile.
   *
   * Manual OWNER/GM deductions (`deductManual`) remain orthogonal:
   * they reduce `remaining` directly and do NOT update
   * `lastDeductionYearMonth`, so a manual payment mid-month is an
   * EXTRA pay-down, not a replacement of the scheduled instalment.
   * This matches the Owner's mental model where the manual channel
   * is for ad-hoc repayments (cash handover, settlement) while the
   * payslip line is the routine monthly instalment.
   */
  async bookPayrollInstalmentsFor(
    userId: string,
    yearMonth: string,
    tx: Prisma.TransactionClient,
  ): Promise<Prisma.Decimal> {
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      throw new BadRequestException('yearMonth must match YYYY-MM');
    }
    const active = await tx.employeeLoan.findMany({
      where: {
        userId,
        status: LoanStatus.ACTIVE,
        remaining: { gt: 0 },
      },
      orderBy: { createdAt: 'asc' },
    });
    let total = new Prisma.Decimal(0);
    for (const loan of active) {
      if (loan.lastDeductionYearMonth === yearMonth) continue;
      const cap = loan.remaining;
      if (cap.lte(0)) continue;
      const monthly = loan.monthlyDeduction;
      const deduction = Prisma.Decimal.min(monthly, cap);
      if (deduction.lte(0)) continue;
      const nextRemaining = cap.sub(deduction);
      const nextStatus = nextRemaining.lte(0)
        ? LoanStatus.SETTLED
        : loan.status;
      await tx.employeeLoan.update({
        where: { id: loan.id },
        data: {
          remaining: nextRemaining,
          status: nextStatus,
          lastDeductionYearMonth: yearMonth,
        },
      });
      total = total.add(deduction);
    }
    return total;
  }

  /**
   * V19.20 — safe backfill for payrolls created BEFORE this version.
   *
   * Old payroll rows sit with `loanDeduction = 0` even for employees
   * with ACTIVE loans, because `PayrollService.create` didn't book
   * instalments at the time. The Owner can click "إعادة حساب القسط"
   * on a PENDING row to pull the missed instalment in. This helper
   * is DIFFERENT from `bookPayrollInstalmentsFor`: it will ONLY touch
   * loans whose `lastDeductionYearMonth IS NULL`, i.e. loans that
   * have never had a scheduled instalment consumed by any payroll.
   *
   * Why the stricter filter? `lastDeductionYearMonth` is a simple
   * high-water mark, not a calendar. If a loan shows "2026-04" it
   * means April already took its cut. Letting a recalc stamp it back
   * to "2026-03" would both (a) reset the high-water mark, opening
   * the door to re-taking April on the next "recalc" click, and (b)
   * deduct an additional instalment against `remaining` that wasn't
   * scheduled. Refusing to backdate keeps the ledger monotonic.
   *
   * Implication: if payroll was mistakenly run for a later month
   * first, the user must correct forward (SETTLED-then-reissue or
   * manual deduct + credit note), not via this helper.
   */
  async recalcUnbookedInstalmentsFor(
    userId: string,
    yearMonth: string,
    tx: Prisma.TransactionClient,
  ): Promise<Prisma.Decimal> {
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      throw new BadRequestException('yearMonth must match YYYY-MM');
    }
    const active = await tx.employeeLoan.findMany({
      where: {
        userId,
        status: LoanStatus.ACTIVE,
        remaining: { gt: 0 },
        lastDeductionYearMonth: null,
      },
      orderBy: { createdAt: 'asc' },
    });
    let total = new Prisma.Decimal(0);
    for (const loan of active) {
      const cap = loan.remaining;
      if (cap.lte(0)) continue;
      const deduction = Prisma.Decimal.min(loan.monthlyDeduction, cap);
      if (deduction.lte(0)) continue;
      const nextRemaining = cap.sub(deduction);
      const nextStatus = nextRemaining.lte(0)
        ? LoanStatus.SETTLED
        : loan.status;
      await tx.employeeLoan.update({
        where: { id: loan.id },
        data: {
          remaining: nextRemaining,
          status: nextStatus,
          lastDeductionYearMonth: yearMonth,
        },
      });
      total = total.add(deduction);
    }
    return total;
  }
}
