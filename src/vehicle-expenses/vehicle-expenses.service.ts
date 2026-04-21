import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SafariRole,
  VehicleExpenseStatus,
  VehicleExpenseType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Roles that can read fleet expenses at the institutional level
 * (cross-supervisor). The FLEET_SUPERVISOR is handled separately —
 * they only ever see their own submissions.
 */
const REVIEWER_ROLES: ReadonlySet<SafariRole> = new Set([
  SafariRole.ACCOUNTANT,
  SafariRole.OWNER,
  SafariRole.GENERAL_MANAGER,
]);

const INCLUDE_PEOPLE = {
  submittedBy: {
    select: { id: true, fullName: true, username: true },
  },
  reviewedBy: {
    select: { id: true, fullName: true, username: true },
  },
} as const;

@Injectable()
export class VehicleExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Create: only FLEET_SUPERVISOR. Receipt is mandatory (DTO enforces). */
  async create(
    userId: string,
    safariRole: SafariRole,
    dto: {
      vehiclePlate: string;
      vehicleLabel?: string;
      expenseType: VehicleExpenseType;
      amount: number;
      odometerKm?: number;
      vendorName?: string;
      description?: string;
      expenseDate?: string;
      receiptUrl: string;
    },
  ) {
    if (safariRole !== SafariRole.FLEET_SUPERVISOR) {
      throw new ForbiddenException('Only FLEET_SUPERVISOR can log vehicle expenses');
    }

    const receipt = dto.receiptUrl?.trim();
    if (!receipt) {
      // Defence in depth: the DTO validates @IsNotEmpty already.
      throw new BadRequestException('Receipt photo is mandatory for vehicle expenses');
    }

    const amount = new Prisma.Decimal(Number(dto.amount).toFixed(4));
    if (amount.lte(0)) {
      throw new BadRequestException('Amount must be positive');
    }

    return this.prisma.vehicleExpense.create({
      data: {
        vehiclePlate: dto.vehiclePlate.trim(),
        vehicleLabel: dto.vehicleLabel?.trim() || null,
        expenseType: dto.expenseType,
        amount,
        odometerKm: dto.odometerKm ?? null,
        vendorName: dto.vendorName?.trim() || null,
        description: dto.description?.trim() || null,
        receiptUrl: receipt,
        status: VehicleExpenseStatus.PENDING_ACCOUNTANT,
        submittedById: userId,
        expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : new Date(),
      },
      include: INCLUDE_PEOPLE,
    });
  }

  /** List for the current user — FLEET_SUPERVISOR gets own rows, reviewers get everything. */
  async listForUser(
    userId: string,
    safariRole: SafariRole,
    filters: {
      from?: string;
      to?: string;
      status?: VehicleExpenseStatus;
      expenseType?: VehicleExpenseType;
      vehiclePlate?: string;
    },
  ) {
    const isFleet = safariRole === SafariRole.FLEET_SUPERVISOR;
    const isReviewer = REVIEWER_ROLES.has(safariRole);
    if (!isFleet && !isReviewer) {
      throw new ForbiddenException();
    }

    const where: Prisma.VehicleExpenseWhereInput = {};
    if (isFleet) where.submittedById = userId;
    if (filters.from || filters.to) {
      where.expenseDate = {};
      if (filters.from) where.expenseDate.gte = new Date(filters.from);
      if (filters.to) where.expenseDate.lte = new Date(filters.to);
    }
    if (filters.status) where.status = filters.status;
    if (filters.expenseType) where.expenseType = filters.expenseType;
    if (filters.vehiclePlate) {
      where.vehiclePlate = {
        contains: filters.vehiclePlate.trim(),
        mode: 'insensitive',
      };
    }

    return this.prisma.vehicleExpense.findMany({
      where,
      orderBy: { expenseDate: 'desc' },
      include: INCLUDE_PEOPLE,
    });
  }

  /** Queue for the accountant. */
  async listPendingApproval(safariRole: SafariRole) {
    if (!REVIEWER_ROLES.has(safariRole)) {
      throw new ForbiddenException();
    }
    return this.prisma.vehicleExpense.findMany({
      where: { status: VehicleExpenseStatus.PENDING_ACCOUNTANT },
      orderBy: { expenseDate: 'desc' },
      include: INCLUDE_PEOPLE,
    });
  }

  /**
   * Accountant decision. Approve / reject only — and reject MUST carry
   * a reason so the FLEET_SUPERVISOR knows what to fix.
   */
  async updateStatus(
    id: string,
    safariRole: SafariRole,
    actorUserId: string,
    dto: { status: VehicleExpenseStatus; rejectionReason?: string },
  ) {
    // Dustur §4.2 mirror — only ACCOUNTANT acts. OWNER / GM audit via
    // the report but do not book.
    if (safariRole !== SafariRole.ACCOUNTANT) {
      throw new ForbiddenException('Only ACCOUNTANT can approve or reject vehicle expenses');
    }
    const existing = await this.prisma.vehicleExpense.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException('Vehicle expense not found');
    }
    if (existing.status !== VehicleExpenseStatus.PENDING_ACCOUNTANT) {
      throw new BadRequestException(
        'Only a pending vehicle expense can be approved or rejected',
      );
    }
    if (
      dto.status === VehicleExpenseStatus.REJECTED &&
      !dto.rejectionReason?.trim()
    ) {
      throw new BadRequestException('Rejection reason is required');
    }

    return this.prisma.vehicleExpense.update({
      where: { id },
      data: {
        status: dto.status,
        reviewedById: actorUserId,
        reviewedAt: new Date(),
        rejectionReason:
          dto.status === VehicleExpenseStatus.REJECTED
            ? (dto.rejectionReason?.trim() ?? null)
            : null,
      },
      include: INCLUDE_PEOPLE,
    });
  }

  /**
   * Aggregated fleet report: totals + per-vehicle + per-expense-type +
   * per-month breakdown for a date range. Only considers APPROVED
   * rows so pending / rejected never pollute the cost summary.
   * Consumed by the Owner and the Accountant.
   */
  async getReport(
    safariRole: SafariRole,
    filters: { from: string; to: string },
  ) {
    if (!REVIEWER_ROLES.has(safariRole)) {
      throw new ForbiddenException();
    }
    const from = new Date(filters.from);
    const to = new Date(filters.to);
    if (Number.isNaN(from.valueOf()) || Number.isNaN(to.valueOf())) {
      throw new BadRequestException('Invalid date range');
    }

    const rows = await this.prisma.vehicleExpense.findMany({
      where: {
        status: VehicleExpenseStatus.APPROVED,
        expenseDate: { gte: from, lte: to },
      },
      select: {
        id: true,
        vehiclePlate: true,
        vehicleLabel: true,
        expenseType: true,
        amount: true,
        expenseDate: true,
      },
      orderBy: { expenseDate: 'desc' },
    });

    let total = new Prisma.Decimal(0);
    const byVehicle = new Map<
      string,
      { vehiclePlate: string; vehicleLabel: string | null; amount: Prisma.Decimal; count: number }
    >();
    const byType = new Map<VehicleExpenseType, { amount: Prisma.Decimal; count: number }>();
    const byMonth = new Map<string, { amount: Prisma.Decimal; count: number }>();

    for (const row of rows) {
      total = total.add(row.amount);

      const vehicleKey = row.vehiclePlate;
      const vehicleAgg = byVehicle.get(vehicleKey) ?? {
        vehiclePlate: row.vehiclePlate,
        vehicleLabel: row.vehicleLabel,
        amount: new Prisma.Decimal(0),
        count: 0,
      };
      vehicleAgg.amount = vehicleAgg.amount.add(row.amount);
      vehicleAgg.count += 1;
      if (!vehicleAgg.vehicleLabel && row.vehicleLabel) {
        vehicleAgg.vehicleLabel = row.vehicleLabel;
      }
      byVehicle.set(vehicleKey, vehicleAgg);

      const typeAgg = byType.get(row.expenseType) ?? {
        amount: new Prisma.Decimal(0),
        count: 0,
      };
      typeAgg.amount = typeAgg.amount.add(row.amount);
      typeAgg.count += 1;
      byType.set(row.expenseType, typeAgg);

      const monthKey = `${row.expenseDate.getUTCFullYear()}-${String(
        row.expenseDate.getUTCMonth() + 1,
      ).padStart(2, '0')}`;
      const monthAgg = byMonth.get(monthKey) ?? {
        amount: new Prisma.Decimal(0),
        count: 0,
      };
      monthAgg.amount = monthAgg.amount.add(row.amount);
      monthAgg.count += 1;
      byMonth.set(monthKey, monthAgg);
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      totalKd: total.toString(),
      count: rows.length,
      byVehicle: Array.from(byVehicle.values())
        .map((v) => ({
          vehiclePlate: v.vehiclePlate,
          vehicleLabel: v.vehicleLabel,
          amountKd: v.amount.toString(),
          count: v.count,
        }))
        .sort((a, b) =>
          new Prisma.Decimal(b.amountKd).cmp(new Prisma.Decimal(a.amountKd)),
        ),
      byType: Array.from(byType.entries())
        .map(([type, v]) => ({
          expenseType: type,
          amountKd: v.amount.toString(),
          count: v.count,
        }))
        .sort((a, b) =>
          new Prisma.Decimal(b.amountKd).cmp(new Prisma.Decimal(a.amountKd)),
        ),
      byMonth: Array.from(byMonth.entries())
        .map(([month, v]) => ({
          month,
          amountKd: v.amount.toString(),
          count: v.count,
        }))
        .sort((a, b) => a.month.localeCompare(b.month)),
    };
  }
}
