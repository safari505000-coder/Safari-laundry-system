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

function isApprover(role: SafariRole): boolean {
  return (
    role === SafariRole.OWNER ||
    role === SafariRole.GENERAL_MANAGER ||
    role === SafariRole.ACCOUNTANT
  );
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
    if (dto.installmentCount < 1) {
      throw new BadRequestException('installmentCount must be >= 1');
    }
    const amount = new Prisma.Decimal(dto.amount.toFixed(4));
    const monthly = amount.div(dto.installmentCount).toDecimalPlaces(4);
    const targetUserId = isApprover(actorRole)
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
    if (!isApprover(actorRole)) {
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
    if (!isApprover(actorRole) && row.userId !== actorUserId) {
      throw new ForbiddenException();
    }
    return row;
  }

  async approve(
    actorRole: SafariRole,
    actorUserId: string,
    id: string,
  ): Promise<LoanRow> {
    if (!isApprover(actorRole)) throw new ForbiddenException();
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
    if (!isApprover(actorRole)) throw new ForbiddenException();
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
   * V19.19 — manual loan deduction by OWNER / GENERAL_MANAGER.
   *
   * The previous `applyMonthlyDeductionForUser` path (which payroll
   * called automatically inside `PayrollService.create`) was removed
   * because it could double-deduct an instalment when the same month's
   * payroll was run twice. The Owner explicitly asked that loans be
   * handled OUTSIDE the payroll cycle so salary goes out clean and the
   * loan repayment is a standalone manual event — mirroring the debt-
   * hold "release then disburse" split.
   *
   * This handler clamps the requested amount to `remaining`, drops
   * `remaining` accordingly, and auto-flips `status` to SETTLED when it
   * reaches zero. No new table is added: the audit trail is the
   * `remaining` delta + `updatedAt` on EmployeeLoan, plus the optional
   * note surfaced on the loan row.
   */
  async deductManual(
    actorRole: SafariRole,
    loanId: string,
    amountKd: number,
    note?: string,
  ): Promise<LoanRow> {
    if (
      actorRole !== SafariRole.OWNER &&
      actorRole !== SafariRole.GENERAL_MANAGER
    ) {
      throw new ForbiddenException(
        'Manual loan deductions are OWNER / GM only',
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
}
