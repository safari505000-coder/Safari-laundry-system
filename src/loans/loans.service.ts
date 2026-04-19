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
   * Deduct this month's installment from every ACTIVE loan owned by
   * `userId`. Called from PayrollService.create when a new payroll row
   * is booked. Returns the total KD to add to that payroll's
   * `deductions` column. Any loan whose remaining would hit zero is
   * marked SETTLED.
   */
  async applyMonthlyDeductionForUser(
    userId: string,
    prismaTx?: Prisma.TransactionClient,
  ): Promise<Prisma.Decimal> {
    const client = prismaTx ?? this.prisma;
    const active = await client.employeeLoan.findMany({
      where: { userId, status: LoanStatus.ACTIVE },
    });
    let total = new Prisma.Decimal(0);
    for (const loan of active) {
      const deduction = Prisma.Decimal.min(
        loan.monthlyDeduction,
        loan.remaining,
      );
      if (deduction.lte(0)) continue;
      const nextRemaining = loan.remaining.sub(deduction);
      await client.employeeLoan.update({
        where: { id: loan.id },
        data: {
          remaining: nextRemaining,
          status: nextRemaining.lte(0) ? LoanStatus.SETTLED : loan.status,
        },
      });
      total = total.add(deduction);
    }
    return total;
  }
}
