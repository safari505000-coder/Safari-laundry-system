import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashStatus,
  ManagerCashCustodyStatus,
  OrderStatus,
  PosPaymentMethod,
  SafariRole,
  ShiftStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfirmHandoverDto } from '../dto/confirm-handover.dto';
import type {
  DriverBalanceResponseDto,
  DriverBalanceRowDto,
  HandoverResultDto,
} from '../dto/driver-balance.dto';
import type { UpdateDriverTrackingDto } from '../dto/update-driver-tracking.dto';
import {
  assertDeclaredMatchesLedgerMinor,
  minorToAmountString,
  sumOrderMinors,
} from '../finance-money';

const KUWAIT_OFFSET_MIN = 180;

function kuwaitMidnightUtc(nowUtc: Date): Date {
  const k = new Date(nowUtc.getTime() + KUWAIT_OFFSET_MIN * 60_000);
  const y = k.getUTCFullYear();
  const m = k.getUTCMonth();
  const d = k.getUTCDate();
  const utcMs = Date.UTC(y, m, d, 0, 0, 0, 0) - KUWAIT_OFFSET_MIN * 60_000;
  return new Date(utcMs);
}

function parseLatLng(input?: string | null): { lat: number; lng: number } | null {
  if (!input) return null;
  const parts = input.split(',').map((x) => Number.parseFloat(x.trim()));
  if (parts.length !== 2) return null;
  const [lat, lng] = parts;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

@Injectable()
export class CashService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureOpenShiftForDriver(driverId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: driverId } });
    if (!user || user.safariRole !== SafariRole.DRIVER) return;

    const open = await this.prisma.shift.findFirst({
      where: { driverId, status: ShiftStatus.OPEN },
      orderBy: { startedAt: 'desc' },
    });
    if (open) {
      const midnightUtc = kuwaitMidnightUtc(new Date());
      if (open.startedAt.getTime() < midnightUtc.getTime()) {
        await this.prisma.shift.update({
          where: { id: open.id },
          data: {
            status: ShiftStatus.CLOSED,
            endedAt: new Date(midnightUtc.getTime() - 1),
          },
        });
        await this.prisma.shift.create({
          data: { driverId, status: ShiftStatus.OPEN },
        });
      }
      return;
    }
    await this.prisma.shift.create({
      data: { driverId, status: ShiftStatus.OPEN },
    });
  }

  async getDailyPosSalesByPaymentMethod(
    fromIso: string,
    toIso: string,
    scopedDriverId?: string,
  ) {
    const from = new Date(fromIso);
    const to = new Date(toIso);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid date range');
    }
    const rows = await this.prisma.order.groupBy({
      by: ['posPaymentMethod'],
      where: {
        status: OrderStatus.COMPLETED,
        completedAt: { gte: from, lte: to },
        posPaymentMethod: { not: null },
        ...(scopedDriverId ? { driverId: scopedDriverId } : {}),
      },
      _sum: { totalPrice: true },
      _count: true,
    });
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      rows: rows
        .filter((r): r is typeof r & { posPaymentMethod: PosPaymentMethod } =>
          r.posPaymentMethod !== null,
        )
        .map((r) => ({
          posPaymentMethod: r.posPaymentMethod,
          orderCount: r._count,
          totalRevenue:
            r._sum.totalPrice !== null && r._sum.totalPrice !== undefined
              ? r._sum.totalPrice.toString()
              : '0',
        })),
    };
  }

  async getDriverBalances(): Promise<DriverBalanceResponseDto> {
    const drivers = await this.prisma.user.findMany({
      where: { safariRole: SafariRole.DRIVER },
      select: {
        id: true,
        username: true,
        fullName: true,
        employeeId: true,
        phone: true,
        branchId: true,
      },
      orderBy: { username: 'asc' },
    });
    const rows: DriverBalanceRowDto[] = [];
    for (const d of drivers) {
      const shift = await this.prisma.shift.findFirst({
        where: { driverId: d.id, status: ShiftStatus.OPEN },
        orderBy: { startedAt: 'desc' },
      });
      /*
       * Dastur §3 — "Pending invoices" = every COMPLETED order this driver
       * issued whose cashStatus is still PAID_TO_DRIVER (not yet closed by
       * the accountant), split per POS payment method. CASH clears via the
       * handover/custody flow; KNET / PAYMENT_LINK / ONLINE clear when the
       * accountant verifies the matching bank / Z-report deposit.
       */
      const pendingAll = await this.prisma.order.findMany({
        where: {
          driverId: d.id,
          status: OrderStatus.COMPLETED,
          cashStatus: CashStatus.PAID_TO_DRIVER,
        },
        select: { totalPrice: true, posPaymentMethod: true },
      });

      const buckets = {
        cash: [] as { totalPrice: typeof pendingAll[number]['totalPrice'] }[],
        knet: [] as { totalPrice: typeof pendingAll[number]['totalPrice'] }[],
        link: [] as { totalPrice: typeof pendingAll[number]['totalPrice'] }[],
        online: [] as { totalPrice: typeof pendingAll[number]['totalPrice'] }[],
      };
      for (const o of pendingAll) {
        switch (o.posPaymentMethod) {
          case PosPaymentMethod.CASH:
            buckets.cash.push({ totalPrice: o.totalPrice });
            break;
          case PosPaymentMethod.KNET:
            buckets.knet.push({ totalPrice: o.totalPrice });
            break;
          case PosPaymentMethod.PAYMENT_LINK:
            buckets.link.push({ totalPrice: o.totalPrice });
            break;
          case PosPaymentMethod.ONLINE:
            buckets.online.push({ totalPrice: o.totalPrice });
            break;
          default:
            break;
        }
      }

      const cashMinor = sumOrderMinors(buckets.cash);
      const knetMinor = sumOrderMinors(buckets.knet);
      const linkMinor = sumOrderMinors(buckets.link);
      const onlineMinor = sumOrderMinors(buckets.online);
      const totalMinor = cashMinor + knetMinor + linkMinor + onlineMinor;

      rows.push({
        driverId: d.id,
        employeeId: d.employeeId,
        username: d.username,
        fullName: d.fullName,
        phone: d.phone,
        branchId: d.branchId,
        currentShiftId: shift?.id ?? null,
        shiftStartedAt: shift?.startedAt ?? null,
        heldCashTotal: minorToAmountString(cashMinor),
        pendingSettlementOrderCount: buckets.cash.length,
        pendingCashKd: minorToAmountString(cashMinor),
        pendingKnetKd: minorToAmountString(knetMinor),
        pendingLinkKd: minorToAmountString(linkMinor),
        pendingOnlineKd: minorToAmountString(onlineMinor),
        pendingTotalKd: minorToAmountString(totalMinor),
        pendingInvoiceCount:
          buckets.cash.length +
          buckets.knet.length +
          buckets.link.length +
          buckets.online.length,
      });
    }
    return { drivers: rows };
  }

  async getTotalCashWithDrivers(): Promise<string> {
    const rows = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.COMPLETED,
        cashStatus: CashStatus.PAID_TO_DRIVER,
        posPaymentMethod: PosPaymentMethod.CASH,
      },
      select: { totalPrice: true },
    });
    return minorToAmountString(sumOrderMinors(rows));
  }

  async getDriverMonitoring() {
    const activeDrivers = await this.prisma.user.findMany({
      where: {
        safariRole: SafariRole.DRIVER,
        shiftsAsDriver: { some: { status: ShiftStatus.OPEN } },
      },
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        fullName: true,
        username: true,
        phone: true,
        vehicleLabel: true,
        lastKnownLocation: true,
        branch: { select: { id: true, name: true, location: true } },
      },
    });
    return {
      drivers: activeDrivers.map((d) => {
        const live = parseLatLng(d.lastKnownLocation);
        const fallback = parseLatLng(d.branch?.location ?? null);
        const location = live ?? fallback;
        return {
          driverId: d.id,
          fullName: d.fullName,
          username: d.username,
          phone: d.phone,
          vehicleLabel: d.vehicleLabel ?? 'Toyota LC300',
          status: 'ON_SHIFT' as const,
          source: live ? ('LIVE_GPS' as const) : ('BRANCH_FALLBACK' as const),
          lastKnownLocation: live,
          markerLocation: location,
          branch: d.branch,
        };
      }),
    };
  }

  async updateDriverTracking(driverId: string, dto: UpdateDriverTrackingDto) {
    const driver = await this.prisma.user.findUnique({
      where: { id: driverId },
      select: { id: true, safariRole: true },
    });
    if (!driver || driver.safariRole !== SafariRole.DRIVER) {
      throw new NotFoundException('Driver not found');
    }
    if (
      dto.lastKnownLocation !== undefined &&
      dto.lastKnownLocation.trim().length > 0 &&
      !parseLatLng(dto.lastKnownLocation)
    ) {
      throw new BadRequestException('lastKnownLocation must be "lat,lng"');
    }
    return this.prisma.user.update({
      where: { id: driverId },
      data: {
        ...(dto.vehicleLabel !== undefined
          ? { vehicleLabel: dto.vehicleLabel.trim() || null }
          : {}),
        ...(dto.lastKnownLocation !== undefined
          ? { lastKnownLocation: dto.lastKnownLocation.trim() || null }
          : {}),
      },
      select: {
        id: true,
        fullName: true,
        username: true,
        vehicleLabel: true,
        lastKnownLocation: true,
      },
    });
  }

  async confirmHandover(
    managerId: string,
    dto: ConfirmHandoverDto,
  ): Promise<HandoverResultDto> {
    const driver = await this.prisma.user.findUnique({
      where: { id: dto.driverId },
    });
    if (!driver || driver.safariRole !== SafariRole.DRIVER) {
      throw new NotFoundException('Driver not found');
    }
    return this.prisma.$transaction(async (tx) => {
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
          assertDeclaredMatchesLedgerMinor(systemMinor, dto.declaredHandoverTotal);
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
      if (pending.length === 0) {
        if (!shift) {
          throw new BadRequestException(
            'No cash pending settlement and no open shift to close.',
          );
        }
        await tx.shift.update({
          where: { id: shift.id },
          data: {
            status: ShiftStatus.CLOSED,
            endedAt: new Date(),
            systemHandoverTotal: '0.0000',
            declaredHandoverTotal:
              dto.declaredHandoverTotal !== undefined
                ? dto.declaredHandoverTotal.toFixed(4)
                : null,
            ordersSettledCount: 0,
            bankDepositReceiptUrl: dto.depositReceiptUrl ?? null,
            confirmedByManagerId: managerId,
            confirmedAt: new Date(),
          },
        });
        return {
          settledOrderCount: 0,
          systemHandoverTotal: '0.0000',
          shiftId: shift.id,
          bankDepositReceiptUrl: dto.depositReceiptUrl ?? null,
        };
      }
      if (!shift) {
        throw new BadRequestException(
          'Ledger shows cash due but the driver has no OPEN shift. Reconcile before handover.',
        );
      }
      const ids = pending.map((o) => o.id);
      const updated = await tx.order.updateMany({
        where: {
          id: { in: ids },
          cashStatus: CashStatus.PAID_TO_DRIVER,
          posPaymentMethod: PosPaymentMethod.CASH,
        },
        data: {
          cashStatus: CashStatus.HANDED_OVER_TO_OFFICE,
          handoverShiftId: shift.id,
        },
      });
      if (updated.count !== pending.length) {
        throw new ConflictException(
          'Concurrent handover detected; not all orders could be settled. Retry.',
        );
      }
      const systemHandoverTotal = minorToAmountString(systemMinor);
      await tx.shift.update({
        where: { id: shift.id },
        data: {
          status: ShiftStatus.CLOSED,
          endedAt: new Date(),
          systemHandoverTotal,
          declaredHandoverTotal:
            dto.declaredHandoverTotal !== undefined
              ? dto.declaredHandoverTotal.toFixed(4)
              : null,
          ordersSettledCount: pending.length,
          bankDepositReceiptUrl: dto.depositReceiptUrl ?? null,
          confirmedByManagerId: managerId,
          confirmedAt: new Date(),
        },
      });

      // Dastur §3 — create the manager custody bag so aging can run.
      // Slip-first legacy flow → AWAITING_VERIFICATION when a slip was provided,
      // otherwise PENDING_DEPOSIT for the new two-step flow.
      const manager = await tx.user.findUnique({
        where: { id: managerId },
        select: { branchId: true },
      });
      const hasSlip = Boolean(dto.depositReceiptUrl);
      await tx.managerCashCustody.create({
        data: {
          managerId,
          driverId: dto.driverId,
          branchId: manager?.branchId ?? driver.branchId ?? null,
          shiftId: shift.id,
          amountKd: systemHandoverTotal,
          settledOrderCount: pending.length,
          status: hasSlip
            ? ManagerCashCustodyStatus.AWAITING_VERIFICATION
            : ManagerCashCustodyStatus.PENDING_DEPOSIT,
          depositSlipUrl: dto.depositReceiptUrl ?? null,
          slipUploadedAt: hasSlip ? new Date() : null,
        },
      });

      return {
        settledOrderCount: pending.length,
        systemHandoverTotal,
        shiftId: shift.id,
        bankDepositReceiptUrl: dto.depositReceiptUrl ?? null,
      };
    });
  }

  async getOwnerFinancialCycleReport() {
    const rows = await this.prisma.order.findMany({
      where: {
        posPaymentMethod: PosPaymentMethod.CASH,
        handoverShiftId: { not: null },
      },
      orderBy: { updatedAt: 'desc' },
      take: 1000,
      select: {
        id: true,
        totalPrice: true,
        updatedAt: true,
        handoverShift: {
          select: {
            id: true,
            confirmedAt: true,
            confirmedByManager: {
              select: { id: true, fullName: true, username: true },
            },
            bankDepositLogs: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                id: true,
                receiptImageUrl: true,
                verifiedAt: true,
                verifiedByAccountant: {
                  select: { id: true, fullName: true, username: true },
                },
              },
            },
          },
        },
      },
    });
    return {
      rows: rows.map((o) => {
        const shift = o.handoverShift;
        const deposit = shift?.bankDepositLogs[0] ?? null;
        return {
          orderId: o.id,
          amountKd: o.totalPrice.toString(),
          collectedAt: shift?.confirmedAt?.toISOString() ?? null,
          collectedByManager: shift?.confirmedByManager ?? null,
          depositLogId: deposit?.id ?? null,
          receiptImageUrl: deposit?.receiptImageUrl ?? null,
          verifiedAt: deposit?.verifiedAt?.toISOString() ?? null,
          verifiedByAccountant: deposit?.verifiedByAccountant ?? null,
          lastUpdatedAt: o.updatedAt.toISOString(),
        };
      }),
    };
  }
}

