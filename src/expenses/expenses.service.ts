import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  ExpenseCategory,
  ExpenseStatus,
  Prisma,
  SafariRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  private assertCanRecordExpense(role: SafariRole): void {
    if (role !== SafariRole.MANAGER && role !== SafariRole.DRIVER) {
      throw new ForbiddenException('Only MANAGER or DRIVER can record expenses');
    }
  }

  async create(
    userId: string,
    safariRole: SafariRole,
    dto: {
      title: string;
      amount: number;
      category: ExpenseCategory;
      note?: string;
      receiptUrl?: string;
    },
  ) {
    this.assertCanRecordExpense(safariRole);
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { branchId: true },
    });
    return this.prisma.branchExpense.create({
      data: {
        title: dto.title.trim(),
        amount: dto.amount.toFixed(4),
        category: dto.category,
        status: ExpenseStatus.PENDING_ACCOUNTANT,
        note: dto.note?.trim() || null,
        receiptUrl: dto.receiptUrl?.trim() || null,
        recordedById: userId,
        branchId: u?.branchId ?? null,
      },
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
      safariRole !== SafariRole.DRIVER
    ) {
      throw new ForbiddenException();
    }
    const from = new Date(fromIso);
    const to = new Date(toIso);
    const driverOwn: Prisma.BranchExpenseWhereInput =
      safariRole === SafariRole.DRIVER ? { recordedById: userId } : {};
    return this.prisma.branchExpense.findMany({
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
  }

  async listPendingApproval(safariRole: SafariRole) {
    if (safariRole !== SafariRole.ACCOUNTANT && safariRole !== SafariRole.OWNER) {
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

  async updateStatus(id: string, safariRole: SafariRole, status: ExpenseStatus) {
    if (safariRole !== SafariRole.ACCOUNTANT && safariRole !== SafariRole.OWNER) {
      throw new ForbiddenException();
    }
    return this.prisma.branchExpense.update({
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
  }

  private branchWhere(
    branchId?: string,
  ): Pick<Prisma.BranchExpenseWhereInput, 'branchId'> | Record<string, never> {
    if (!branchId) return {};
    return { branchId };
  }

  async sumInRange(from: Date, to: Date, branchId?: string): Promise<string> {
    const agg = await this.prisma.branchExpense.aggregate({
      where: {
        expenseDate: { gte: from, lte: to },
        status: ExpenseStatus.APPROVED,
        ...this.branchWhere(branchId),
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
  ): Promise<string> {
    const agg = await this.prisma.branchExpense.aggregate({
      where: {
        expenseDate: { gte: from, lte: to },
        category: { in: categories },
        status: ExpenseStatus.APPROVED,
        ...this.branchWhere(branchId),
      },
      _sum: { amount: true },
    });
    return agg._sum.amount !== null && agg._sum.amount !== undefined
      ? agg._sum.amount.toString()
      : '0';
  }
}
