import { ForbiddenException, Injectable } from '@nestjs/common';
import { FixedExpenseCategory, Prisma, SafariRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Count calendar months with any overlap in [rangeFrom, rangeTo] ∩ [effFrom, effTo]. */
export function countAccruedMonths(
  rangeFrom: Date,
  rangeTo: Date,
  effFrom: Date,
  effTo: Date | null,
): number {
  const capEnd = effTo ?? new Date(Date.UTC(2100, 11, 31));
  const start = new Date(
    Math.max(rangeFrom.getTime(), effFrom.getTime()),
  );
  const end = new Date(Math.min(rangeTo.getTime(), capEnd.getTime()));
  if (start > end) return 0;

  let count = 0;
  const cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
  );
  const endMonth = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1);

  while (cursor.getTime() <= endMonth) {
    const monthStart = new Date(cursor);
    const monthEnd = new Date(
      Date.UTC(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      ),
    );
    const overlapStart = monthStart > start ? monthStart : start;
    const overlapEnd = monthEnd < end ? monthEnd : end;
    if (overlapStart <= overlapEnd) count++;
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return count;
}

@Injectable()
export class FixedExpenseService {
  constructor(private readonly prisma: PrismaService) {}

  private assertOwnerOrManager(role: SafariRole): void {
    if (role !== SafariRole.OWNER && role !== SafariRole.MANAGER) {
      throw new ForbiddenException();
    }
  }

  async create(
    role: SafariRole,
    dto: {
      branchId: string;
      title: string;
      category: FixedExpenseCategory;
      monthlyAmount: number;
      effectiveFrom?: string;
      effectiveTo?: string | null;
    },
  ) {
    this.assertOwnerOrManager(role);
    return this.prisma.fixedExpenseSchedule.create({
      data: {
        branchId: dto.branchId,
        title: dto.title.trim(),
        category: dto.category,
        monthlyAmount: new Prisma.Decimal(dto.monthlyAmount.toFixed(4)),
        effectiveFrom: dto.effectiveFrom
          ? new Date(dto.effectiveFrom)
          : new Date(),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
      },
    });
  }

  async list(branchId?: string) {
    return this.prisma.fixedExpenseSchedule.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
      },
      orderBy: [{ branchId: 'asc' }, { title: 'asc' }],
      include: { branch: { select: { id: true, name: true } } },
    });
  }

  /**
   * Sum of monthlyAmount × accrued months per schedule in [from, to].
   */
  async sumAccruedInRange(
    from: Date,
    to: Date,
    branchId?: string,
  ): Promise<string> {
    const rows = await this.prisma.fixedExpenseSchedule.findMany({
      where: {
        isActive: true,
        ...(branchId ? { branchId } : {}),
      },
    });
    let total = new Prisma.Decimal(0);
    for (const r of rows) {
      const months = countAccruedMonths(from, to, r.effectiveFrom, r.effectiveTo);
      if (months <= 0) continue;
      const amt = r.monthlyAmount.mul(months);
      total = total.add(amt);
    }
    return total.toFixed(4);
  }
}
