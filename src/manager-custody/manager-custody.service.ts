import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CashStatus,
  ManagerCashCustody,
  ManagerCashCustodyStatus,
  OrderStatus,
  PosPaymentMethod,
  Prisma,
  SafariRole,
  ShiftStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertDeclaredMatchesLedgerMinor,
  minorToAmountString,
  parseFixed4ToMinor,
  sumOrderMinors,
} from '../finance/finance-money';
import { ApproveReceiptFromDriverDto } from './dto/approve-receipt-from-driver.dto';
import { ListCustodyQueryDto } from './dto/list-custody-query.dto';
import { RejectCustodyDto } from './dto/reject-custody.dto';
import { UploadDepositSlipDto } from './dto/upload-deposit-slip.dto';
import { VerifyCustodyDto } from './dto/verify-custody.dto';

/** Dastur §3 — 24h window for a manager to bank the cash before we flag it. */
export const CUSTODY_OVERDUE_MS = 24 * 60 * 60 * 1000;

type CustodyWithPeople = Prisma.ManagerCashCustodyGetPayload<{
  include: {
    manager: { select: { id: true; fullName: true; username: true; phone: true } };
    driver: { select: { id: true; fullName: true; username: true } };
    branch: { select: { id: true; name: true } };
    shift: { select: { id: true; endedAt: true; startedAt: true } };
  };
}>;

export type CustodyRowDto = {
  id: string;
  managerId: string;
  managerName: string;
  managerUsername: string;
  managerPhone: string | null;
  driverId: string;
  driverName: string;
  driverUsername: string;
  branchId: string | null;
  branchName: string | null;
  shiftId: string | null;
  amountKd: string;
  settledOrderCount: number;
  status: ManagerCashCustodyStatus;
  receivedFromDriverAt: string;
  slipUploadedAt: string | null;
  depositSlipUrl: string | null;
  verifiedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  /** Whole hours the bag has been in manager custody (since receivedFromDriverAt). */
  ageHours: number;
  /** True if aged >= 24h AND still not VERIFIED (overdue alert). */
  isOverdue: boolean;
};

export type AgingBucket = 'FRESH' | 'WARNING_12H' | 'OVERDUE_24H';

export type AgingSummary = {
  pendingCount: number;
  awaitingVerificationCount: number;
  overdueCount: number;
  totalPendingKd: string;
  totalOverdueKd: string;
  bucket: Record<AgingBucket, number>;
};

@Injectable()
export class ManagerCustodyService {
  private readonly logger = new Logger(ManagerCustodyService.name);
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Dastur §3.DRIVER_EXIT — Manager approves receipt of cash from driver.
   * - Closes the driver's OPEN shift
   * - Flips PAID_TO_DRIVER → HANDED_OVER_TO_OFFICE (zeros driver balance)
   * - Creates a ManagerCashCustody row in PENDING_DEPOSIT status
   * The 24h aging clock starts at `receivedFromDriverAt`.
   */
  async approveReceiptFromDriver(
    managerId: string,
    managerBranchId: string | null,
    dto: ApproveReceiptFromDriverDto,
  ): Promise<CustodyRowDto> {
    const driver = await this.prisma.user.findUnique({
      where: { id: dto.driverId },
      select: { id: true, safariRole: true, branchId: true },
    });
    if (!driver || driver.safariRole !== SafariRole.DRIVER) {
      throw new NotFoundException('Driver not found');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const pending = await tx.order.findMany({
        where: {
          driverId: dto.driverId,
          status: OrderStatus.COMPLETED,
          cashStatus: CashStatus.PAID_TO_DRIVER,
          posPaymentMethod: PosPaymentMethod.CASH,
        },
        select: { id: true, totalPrice: true },
      });
      const systemMinor = sumOrderMinors(pending);

      if (dto.declaredHandoverTotal !== undefined) {
        try {
          assertDeclaredMatchesLedgerMinor(
            systemMinor,
            dto.declaredHandoverTotal,
          );
        } catch (e) {
          throw new BadRequestException(
            e instanceof Error ? e.message : 'Declared total mismatch',
          );
        }
      }

      const shift = await tx.shift.findFirst({
        where: { driverId: dto.driverId, status: ShiftStatus.OPEN },
        orderBy: { startedAt: 'desc' },
      });

      if (pending.length === 0 && !shift) {
        throw new BadRequestException(
          'No cash pending settlement and no open shift to close.',
        );
      }
      if (pending.length > 0 && !shift) {
        throw new BadRequestException(
          'Ledger shows cash due but the driver has no OPEN shift. Reconcile before handover.',
        );
      }

      const amountString = minorToAmountString(systemMinor);

      if (pending.length > 0) {
        const ids = pending.map((o) => o.id);
        const updated = await tx.order.updateMany({
          where: {
            id: { in: ids },
            cashStatus: CashStatus.PAID_TO_DRIVER,
            posPaymentMethod: PosPaymentMethod.CASH,
          },
          data: {
            cashStatus: CashStatus.HANDED_OVER_TO_OFFICE,
            handoverShiftId: shift!.id,
          },
        });
        if (updated.count !== pending.length) {
          throw new ConflictException(
            'Concurrent handover detected; not all orders could be settled. Retry.',
          );
        }
      }

      if (shift) {
        await tx.shift.update({
          where: { id: shift.id },
          data: {
            status: ShiftStatus.CLOSED,
            endedAt: new Date(),
            systemHandoverTotal: amountString,
            declaredHandoverTotal:
              dto.declaredHandoverTotal !== undefined
                ? dto.declaredHandoverTotal.toFixed(4)
                : null,
            ordersSettledCount: pending.length,
            confirmedByManagerId: managerId,
            confirmedAt: new Date(),
            // bankDepositReceiptUrl intentionally left null — slip comes later.
          },
        });
      }

      const bag = await tx.managerCashCustody.create({
        data: {
          managerId,
          driverId: dto.driverId,
          branchId: managerBranchId ?? driver.branchId ?? null,
          shiftId: shift?.id ?? null,
          amountKd: amountString,
          settledOrderCount: pending.length,
          status: ManagerCashCustodyStatus.PENDING_DEPOSIT,
          note: dto.note?.trim() || null,
        },
        include: {
          manager: {
            select: { id: true, fullName: true, username: true, phone: true },
          },
          driver: {
            select: { id: true, fullName: true, username: true },
          },
          branch: { select: { id: true, name: true } },
          shift: { select: { id: true, endedAt: true, startedAt: true } },
        },
      });
      return bag;
    });

    return this.toRow(created);
  }

  /** Manager uploads bank-deposit slip URL → bag moves to AWAITING_VERIFICATION. */
  async uploadDepositSlip(
    custodyId: string,
    managerId: string,
    dto: UploadDepositSlipDto,
  ): Promise<CustodyRowDto> {
    const bag = await this.requireBag(custodyId);
    if (bag.managerId !== managerId) {
      throw new ForbiddenException(
        'Only the manager who received the cash can upload the deposit slip.',
      );
    }
    if (
      bag.status !== ManagerCashCustodyStatus.PENDING_DEPOSIT &&
      bag.status !== ManagerCashCustodyStatus.REJECTED
    ) {
      throw new BadRequestException(
        `Cannot upload slip from status ${bag.status}.`,
      );
    }
    if (dto.declaredDepositTotal !== undefined) {
      const ledgerMinor = parseFixed4ToMinor(bag.amountKd.toFixed(4));
      try {
        assertDeclaredMatchesLedgerMinor(ledgerMinor, dto.declaredDepositTotal);
      } catch (e) {
        throw new BadRequestException(
          e instanceof Error ? e.message : 'Declared deposit mismatch',
        );
      }
    }

    const updated = await this.prisma.managerCashCustody.update({
      where: { id: custodyId },
      data: {
        depositSlipUrl: dto.depositSlipUrl,
        slipUploadedAt: new Date(),
        status: ManagerCashCustodyStatus.AWAITING_VERIFICATION,
        rejectedByAccountantId: null,
        rejectedAt: null,
        rejectionReason: null,
        note: dto.note?.trim() || bag.note,
      },
      include: {
        manager: {
          select: { id: true, fullName: true, username: true, phone: true },
        },
        driver: { select: { id: true, fullName: true, username: true } },
        branch: { select: { id: true, name: true } },
        shift: { select: { id: true, endedAt: true, startedAt: true } },
      },
    });

    // Mirror slip onto the shift for the legacy bank-deposit-receipt view.
    if (updated.shiftId) {
      await this.prisma.shift.update({
        where: { id: updated.shiftId },
        data: { bankDepositReceiptUrl: dto.depositSlipUrl },
      });
    }

    return this.toRow(updated);
  }

  /** Accountant verifies a bag → VERIFIED. */
  async verifyCustody(
    custodyId: string,
    accountantId: string,
    dto: VerifyCustodyDto,
  ): Promise<CustodyRowDto> {
    const bag = await this.requireBag(custodyId);
    if (bag.status !== ManagerCashCustodyStatus.AWAITING_VERIFICATION) {
      throw new BadRequestException(
        `Only bags in AWAITING_VERIFICATION can be verified (got ${bag.status}).`,
      );
    }
    const updated = await this.prisma.managerCashCustody.update({
      where: { id: custodyId },
      data: {
        status: ManagerCashCustodyStatus.VERIFIED,
        verifiedByAccountantId: accountantId,
        verifiedAt: new Date(),
        note: dto.note?.trim() || bag.note,
      },
      include: {
        manager: {
          select: { id: true, fullName: true, username: true, phone: true },
        },
        driver: { select: { id: true, fullName: true, username: true } },
        branch: { select: { id: true, name: true } },
        shift: { select: { id: true, endedAt: true, startedAt: true } },
      },
    });
    return this.toRow(updated);
  }

  /** Accountant rejects a bag → back to PENDING_DEPOSIT so the manager re-uploads. */
  async rejectCustody(
    custodyId: string,
    accountantId: string,
    dto: RejectCustodyDto,
  ): Promise<CustodyRowDto> {
    const bag = await this.requireBag(custodyId);
    if (bag.status !== ManagerCashCustodyStatus.AWAITING_VERIFICATION) {
      throw new BadRequestException(
        `Only bags in AWAITING_VERIFICATION can be rejected (got ${bag.status}).`,
      );
    }
    const updated = await this.prisma.managerCashCustody.update({
      where: { id: custodyId },
      data: {
        status: ManagerCashCustodyStatus.REJECTED,
        rejectedByAccountantId: accountantId,
        rejectedAt: new Date(),
        rejectionReason: dto.rejectionReason.trim(),
      },
      include: {
        manager: {
          select: { id: true, fullName: true, username: true, phone: true },
        },
        driver: { select: { id: true, fullName: true, username: true } },
        branch: { select: { id: true, name: true } },
        shift: { select: { id: true, endedAt: true, startedAt: true } },
      },
    });
    return this.toRow(updated);
  }

  /** Manager — their own bags (all statuses, most recent first). */
  async listMine(managerId: string): Promise<CustodyRowDto[]> {
    const rows = await this.prisma.managerCashCustody.findMany({
      where: { managerId },
      orderBy: { receivedFromDriverAt: 'desc' },
      take: 200,
      include: {
        manager: {
          select: { id: true, fullName: true, username: true, phone: true },
        },
        driver: { select: { id: true, fullName: true, username: true } },
        branch: { select: { id: true, name: true } },
        shift: { select: { id: true, endedAt: true, startedAt: true } },
      },
    });
    return rows.map((r) => this.toRow(r));
  }

  /**
   * Owner / Accountant aging view — "Cash Held by Managers".
   * Returns unsettled bags (PENDING_DEPOSIT or AWAITING_VERIFICATION) with age +
   * a roll-up summary (overdue >24h highlighted in the UI).
   */
  async listAging(query: ListCustodyQueryDto): Promise<{
    rows: CustodyRowDto[];
    summary: AgingSummary;
  }> {
    const where: Prisma.ManagerCashCustodyWhereInput = {};
    if (query.status) {
      where.status = query.status;
    } else {
      where.status = {
        in: [
          ManagerCashCustodyStatus.PENDING_DEPOSIT,
          ManagerCashCustodyStatus.AWAITING_VERIFICATION,
          ManagerCashCustodyStatus.REJECTED,
        ],
      };
    }
    if (query.managerId) where.managerId = query.managerId;
    if (query.branchId) where.branchId = query.branchId;

    const rows = await this.prisma.managerCashCustody.findMany({
      where,
      orderBy: { receivedFromDriverAt: 'asc' }, // oldest (worst) first
      take: 500,
      include: {
        manager: {
          select: { id: true, fullName: true, username: true, phone: true },
        },
        driver: { select: { id: true, fullName: true, username: true } },
        branch: { select: { id: true, name: true } },
        shift: { select: { id: true, endedAt: true, startedAt: true } },
      },
    });

    const decorated = rows.map((r) => this.toRow(r));
    return { rows: decorated, summary: this.summarise(decorated) };
  }

  /**
   * SafariStream helper — cheap aggregate for Owner/Accountant alert surface
   * and manager "my pending" card.
   */
  async getStreamMetrics(): Promise<{
    fleetOverdueCount: number;
    fleetOverdueAmountKd: string;
    fleetPendingAmountKd: string;
    pendingByManager: Array<{ managerId: string; count: number; amountKd: string }>;
  }> {
    const rows = await this.prisma.managerCashCustody.findMany({
      where: {
        status: {
          in: [
            ManagerCashCustodyStatus.PENDING_DEPOSIT,
            ManagerCashCustodyStatus.AWAITING_VERIFICATION,
            ManagerCashCustodyStatus.REJECTED,
          ],
        },
      },
      select: {
        managerId: true,
        amountKd: true,
        receivedFromDriverAt: true,
        status: true,
      },
    });
    const now = Date.now();
    let overdueMinor = 0n;
    let pendingMinor = 0n;
    let overdueCount = 0;
    const byManager = new Map<string, { count: number; minor: bigint }>();
    for (const r of rows) {
      const minor = parseFixed4ToMinor(r.amountKd.toFixed(4));
      pendingMinor += minor;
      const age = now - r.receivedFromDriverAt.getTime();
      if (age >= CUSTODY_OVERDUE_MS) {
        overdueCount += 1;
        overdueMinor += minor;
      }
      const acc = byManager.get(r.managerId) ?? { count: 0, minor: 0n };
      acc.count += 1;
      acc.minor += minor;
      byManager.set(r.managerId, acc);
    }
    return {
      fleetOverdueCount: overdueCount,
      fleetOverdueAmountKd: minorToAmountString(overdueMinor),
      fleetPendingAmountKd: minorToAmountString(pendingMinor),
      pendingByManager: [...byManager.entries()].map(([managerId, v]) => ({
        managerId,
        count: v.count,
        amountKd: minorToAmountString(v.minor),
      })),
    };
  }

  // ------------------------------------------------------------------ helpers
  private async requireBag(custodyId: string): Promise<ManagerCashCustody> {
    const bag = await this.prisma.managerCashCustody.findUnique({
      where: { id: custodyId },
    });
    if (!bag) throw new NotFoundException('Custody bag not found.');
    return bag;
  }

  private toRow(r: CustodyWithPeople): CustodyRowDto {
    const ageMs = Date.now() - r.receivedFromDriverAt.getTime();
    const ageHours = Math.max(0, Math.floor(ageMs / (60 * 60 * 1000)));
    const isUnsettled = r.status !== ManagerCashCustodyStatus.VERIFIED;
    return {
      id: r.id,
      managerId: r.managerId,
      managerName: r.manager.fullName,
      managerUsername: r.manager.username,
      managerPhone: r.manager.phone,
      driverId: r.driverId,
      driverName: r.driver.fullName,
      driverUsername: r.driver.username,
      branchId: r.branchId,
      branchName: r.branch?.name ?? null,
      shiftId: r.shiftId,
      amountKd: r.amountKd.toFixed(4),
      settledOrderCount: r.settledOrderCount,
      status: r.status,
      receivedFromDriverAt: r.receivedFromDriverAt.toISOString(),
      slipUploadedAt: r.slipUploadedAt?.toISOString() ?? null,
      depositSlipUrl: r.depositSlipUrl,
      verifiedAt: r.verifiedAt?.toISOString() ?? null,
      rejectedAt: r.rejectedAt?.toISOString() ?? null,
      rejectionReason: r.rejectionReason,
      createdAt: r.createdAt.toISOString(),
      ageHours,
      isOverdue: isUnsettled && ageMs >= CUSTODY_OVERDUE_MS,
    };
  }

  private summarise(rows: CustodyRowDto[]): AgingSummary {
    let pendingMinor = 0n;
    let overdueMinor = 0n;
    const bucket: Record<AgingBucket, number> = {
      FRESH: 0,
      WARNING_12H: 0,
      OVERDUE_24H: 0,
    };
    let pendingCount = 0;
    let awaitingCount = 0;
    let overdueCount = 0;
    for (const r of rows) {
      const minor = parseFixed4ToMinor(r.amountKd);
      if (r.status !== ManagerCashCustodyStatus.VERIFIED) {
        pendingMinor += minor;
      }
      if (r.isOverdue) {
        overdueCount += 1;
        overdueMinor += minor;
        bucket.OVERDUE_24H += 1;
      } else if (r.ageHours >= 12) {
        bucket.WARNING_12H += 1;
      } else {
        bucket.FRESH += 1;
      }
      if (r.status === ManagerCashCustodyStatus.PENDING_DEPOSIT) {
        pendingCount += 1;
      } else if (r.status === ManagerCashCustodyStatus.AWAITING_VERIFICATION) {
        awaitingCount += 1;
      }
    }
    return {
      pendingCount,
      awaitingVerificationCount: awaitingCount,
      overdueCount,
      totalPendingKd: minorToAmountString(pendingMinor),
      totalOverdueKd: minorToAmountString(overdueMinor),
      bucket,
    };
  }
}
