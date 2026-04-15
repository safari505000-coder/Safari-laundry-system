import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PayrollStatus, Prisma, SafariRole } from '@prisma/client';
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
  constructor(private readonly prisma: PrismaService) {}

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
    const ded = new Prisma.Decimal((dto.deductions ?? 0).toFixed(4));
    return this.prisma.payroll.create({
      data: {
        userId: dto.userId,
        branchId: dto.branchId,
        basicSalary: basic,
        allowances: allow,
        deductions: ded,
        paymentDate: new Date(dto.paymentDate),
        status: PayrollStatus.PENDING,
      },
      include: {
        user: { select: { id: true, fullName: true, username: true } },
        branch: { select: { id: true, name: true } },
      },
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
