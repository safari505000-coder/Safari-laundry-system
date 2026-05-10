import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  CommissionPayoutStatus,
  Prisma,
  SafariRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { computeCanonicalCommissionPayoutSummaryTotals } from '../finance/canonical-financial-projection';
import { ListCommissionPayoutsDto } from './dto/list-commission-payouts.dto';

/**
 * V19.16 — read-model for the dedicated commission report. OWNER / GM /
 * ACCOUNTANT see everyone; individual employees can fetch only their
 * own payouts (surfaced under the "كشف العمولة" block on the payslip).
 */
@Injectable()
export class CommissionPayoutsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    actorRole: SafariRole,
    actorUserId: string,
    dto: ListCommissionPayoutsDto,
  ) {
    const adminRoles: SafariRole[] = [
      SafariRole.OWNER,
      SafariRole.GENERAL_MANAGER,
      SafariRole.ACCOUNTANT,
      SafariRole.MANAGER,
    ];
    const isAdmin = adminRoles.includes(actorRole);
    // Employees may only see their own rows; admins may filter freely.
    const earnerFilter: Prisma.CommissionPayoutWhereInput = isAdmin
      ? dto.earnerUserId
        ? { earnerUserId: dto.earnerUserId }
        : {}
      : { earnerUserId: actorUserId };

    const from = new Date(dto.from);
    const to = new Date(dto.to);

    const rows = await this.prisma.commissionPayout.findMany({
      where: {
        earnedAt: { gte: from, lte: to },
        ...(dto.status ? { status: dto.status } : {}),
        ...earnerFilter,
      },
      include: {
        rule: {
          select: {
            id: true,
            name: true,
            mode: true,
            percentage: true,
            payoutTiming: true,
            calculationBase: true,
          },
        },
        earner: { select: { id: true, fullName: true, username: true } },
        sourceOrder: {
          select: { id: true, serialNumber: true, invoiceNumber: true },
        },
      },
      orderBy: { earnedAt: 'desc' },
    });

    // Totals per earner × status for the report summary band.
    const totalsMap = new Map<
      string,
      Record<CommissionPayoutStatus, Prisma.Decimal>
    >();
    for (const r of rows) {
      const bucket =
        totalsMap.get(r.earnerUserId) ??
        ({
          [CommissionPayoutStatus.PENDING]: new Prisma.Decimal(0),
          [CommissionPayoutStatus.RELEASED]: new Prisma.Decimal(0),
          [CommissionPayoutStatus.PAID]: new Prisma.Decimal(0),
          [CommissionPayoutStatus.CANCELLED]: new Prisma.Decimal(0),
        } as Record<CommissionPayoutStatus, Prisma.Decimal>);
      bucket[r.status] = bucket[r.status].add(r.amount);
      totalsMap.set(r.earnerUserId, bucket);
    }
    const totals = [...totalsMap.entries()].map(([earnerUserId, b]) => ({
      earnerUserId,
      pendingKd: b.PENDING.toFixed(4),
      releasedKd: b.RELEASED.toFixed(4),
      paidKd: b.PAID.toFixed(4),
      cancelledKd: b.CANCELLED.toFixed(4),
    }));

    return {
      rows,
      totals,
      summaryTotals: computeCanonicalCommissionPayoutSummaryTotals(totals),
    };
  }

  /**
   * Sum of RELEASED (ready-for-pay) commission per earner. Used by the
   * PayrollService at cut time to pull money from this ledger into the
   * Payroll row's `commissionAmount` column and stamp `payrollId` on
   * the matching rows.
   */
  async sumReleasedForUser(
    earnerUserId: string,
    asOf: Date,
  ): Promise<{ sumKd: string; payoutIds: string[] }> {
    const rows = await this.prisma.commissionPayout.findMany({
      where: {
        earnerUserId,
        status: CommissionPayoutStatus.RELEASED,
        releasedAt: { lte: asOf },
      },
      select: { id: true, amount: true },
    });
    let sum = new Prisma.Decimal(0);
    for (const r of rows) sum = sum.add(r.amount);
    return { sumKd: sum.toFixed(4), payoutIds: rows.map((r) => r.id) };
  }

  /**
   * Called by PayrollService after a Payroll row is created: mark the
   * listed RELEASED payouts as PAID and pin them to the payroll id.
   * Never touches rows in other statuses.
   */
  async markPaidForPayroll(
    payoutIds: string[],
    payrollId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    if (payoutIds.length === 0) return 0;
    const db = tx ?? this.prisma;
    const res = await db.commissionPayout.updateMany({
      where: {
        id: { in: payoutIds },
        status: CommissionPayoutStatus.RELEASED,
      },
      data: {
        status: CommissionPayoutStatus.PAID,
        paidAt: new Date(),
        payrollId,
      },
    });
    return res.count;
  }

  /**
   * Role guard for admin-only endpoints on the controller.
   */
  assertAdmin(role: SafariRole): void {
    const ok =
      role === SafariRole.OWNER ||
      role === SafariRole.GENERAL_MANAGER ||
      role === SafariRole.ACCOUNTANT ||
      role === SafariRole.MANAGER;
    if (!ok) throw new ForbiddenException();
  }
}
