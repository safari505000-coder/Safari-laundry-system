import { ForbiddenException, Injectable } from '@nestjs/common';
import { ExpenseCategory, Prisma, SafariRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  private assertCanManage(role: SafariRole): void {
    if (role !== SafariRole.MANAGER && role !== SafariRole.OWNER) {
      throw new ForbiddenException('Only MANAGER or OWNER can record expenses');
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
      receiptImageData?: string;
    },
  ) {
    this.assertCanManage(safariRole);
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { branchId: true },
    });
    return this.prisma.branchExpense.create({
      data: {
        title: dto.title.trim(),
        amount: dto.amount.toFixed(4),
        category: dto.category,
        note: dto.note?.trim() || null,
        receiptImageData: dto.receiptImageData?.trim() || null,
        recordedById: userId,
        branchId: u?.branchId ?? null,
      },
    });
  }

  async listForUser(
    _userId: string,
    safariRole: SafariRole,
    fromIso: string,
    toIso: string,
    branchId?: string,
  ) {
    if (safariRole !== SafariRole.MANAGER && safariRole !== SafariRole.OWNER) {
      throw new ForbiddenException();
    }
    const from = new Date(fromIso);
    const to = new Date(toIso);
    return this.prisma.branchExpense.findMany({
      where: {
        expenseDate: { gte: from, lte: to },
        ...(branchId ? { branchId } : {}),
      },
      orderBy: { expenseDate: 'desc' },
      include: {
        recordedBy: {
          select: { id: true, fullName: true, username: true },
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
        ...this.branchWhere(branchId),
      },
      _sum: { amount: true },
    });
    return agg._sum.amount !== null && agg._sum.amount !== undefined
      ? agg._sum.amount.toString()
      : '0';
  }
}
