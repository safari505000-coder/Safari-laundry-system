import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { PayrollStatus, Prisma, SafariRole } from '@prisma/client';
import { LoansService } from '../loans/loans.service';
import { PrismaService } from '../prisma/prisma.service';

function netPay(row: {
  basicSalary: Prisma.Decimal;
  allowances: Prisma.Decimal;
  deductions: Prisma.Decimal;
}): Prisma.Decimal {
  return row.basicSalary.add(row.allowances).sub(row.deductions);
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => LoansService))
    private readonly loans: LoansService,
  ) {}

  private assertOwnerOrManager(role: SafariRole): void {
    if (
      role !== SafariRole.OWNER &&
      role !== SafariRole.GENERAL_MANAGER &&
      role !== SafariRole.MANAGER
    ) {
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

    // DUSTUR §D.5 — apply active-loan monthly installments as extra
    // deductions in the same DB transaction so the payroll row and
    // the loan balance updates are atomic. The driver/manager only
    // inputs the manual deductions; the automated loan slice is
    // layered on top.
    return this.prisma.$transaction(async (tx) => {
      const loanDeduction = await this.loans.applyMonthlyDeductionForUser(
        dto.userId,
        tx,
      );
      const totalDed = manualDed.add(loanDeduction);
      return tx.payroll.create({
        data: {
          userId: dto.userId,
          branchId: dto.branchId,
          basicSalary: basic,
          allowances: allow,
          deductions: totalDed,
          paymentDate: new Date(dto.paymentDate),
          status: PayrollStatus.PENDING,
        },
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
        user: { select: { id: true, fullName: true, username: true } },
        branch: { select: { id: true, name: true } },
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
      },
    });
    let total = new Prisma.Decimal(0);
    for (const r of rows) {
      total = total.add(netPay(r));
    }
    return total.toFixed(4);
  }
}
