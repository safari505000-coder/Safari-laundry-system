import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashStatus,
  OrderStatus,
  PosPaymentMethod,
  SafariRole,
  ShiftStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfirmHandoverDto } from './dto/confirm-handover.dto';
import type {
  DriverBalanceResponseDto,
  DriverBalanceRowDto,
  HandoverResultDto,
} from './dto/driver-balance.dto';
import type { OwnerCustomerWalletSummaryDto } from './dto/owner-customer-wallet-summary.dto';
import {
  assertDeclaredMatchesLedgerMinor,
  minorToAmountString,
  sumOrderMinors,
} from './finance-money';

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * DRIVER login: ensure exactly one OPEN shift (field clock-in).
   */
  async ensureOpenShiftForDriver(driverId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: driverId } });
    if (!user || user.safariRole !== SafariRole.DRIVER) {
      return;
    }
    const open = await this.prisma.shift.findFirst({
      where: { driverId, status: ShiftStatus.OPEN },
    });
    if (open) {
      return;
    }
    await this.prisma.shift.create({
      data: { driverId, status: ShiftStatus.OPEN },
    });
  }

  async getDailyPosSalesByPaymentMethod(
    fromIso: string,
    toIso: string,
  ): Promise<{
    from: string;
    to: string;
    rows: {
      posPaymentMethod: PosPaymentMethod;
      orderCount: number;
      totalRevenue: string;
    }[];
  }> {
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

  async getOwnerCustomerWalletSummary(): Promise<OwnerCustomerWalletSummaryDto> {
    const agg = await this.prisma.customerWallet.aggregate({
      _sum: { balance: true, debt: true },
    });
    return {
      totalWalletLiabilities:
        agg._sum.balance !== null && agg._sum.balance !== undefined
          ? agg._sum.balance.toString()
          : '0',
      totalCustomerDebts:
        agg._sum.debt !== null && agg._sum.debt !== undefined
          ? agg._sum.debt.toString()
          : '0',
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
      },
      orderBy: { username: 'asc' },
    });
    const rows: DriverBalanceRowDto[] = [];
    for (const d of drivers) {
      const shift = await this.prisma.shift.findFirst({
        where: { driverId: d.id, status: ShiftStatus.OPEN },
        orderBy: { startedAt: 'desc' },
      });
      const pending = await this.prisma.order.findMany({
        where: {
          driverId: d.id,
          status: OrderStatus.COMPLETED,
          cashStatus: CashStatus.PAID_TO_DRIVER,
        },
        select: { totalPrice: true },
      });
      const heldMinor = sumOrderMinors(pending);
      rows.push({
        driverId: d.id,
        employeeId: d.employeeId,
        username: d.username,
        fullName: d.fullName,
        phone: d.phone,
        currentShiftId: shift?.id ?? null,
        shiftStartedAt: shift?.startedAt ?? null,
        heldCashTotal: minorToAmountString(heldMinor),
        pendingSettlementOrderCount: pending.length,
      });
    }
    return { drivers: rows };
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
      if (pending.length === 0) {
        if (shift) {
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
              confirmedByManagerId: managerId,
              confirmedAt: new Date(),
            },
          });
          return {
            settledOrderCount: 0,
            systemHandoverTotal: '0.0000',
            shiftId: shift.id,
          };
        }
        throw new BadRequestException(
          'No cash pending settlement and no open shift to close.',
        );
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
        },
        data: { cashStatus: CashStatus.HANDED_OVER_TO_OFFICE },
      });
      if (updated.count !== pending.length) {
        throw new ConflictException(
          'Concurrent handover detected; not all orders could be settled. Retry.',
        );
      }
      await tx.shift.update({
        where: { id: shift.id },
        data: {
          status: ShiftStatus.CLOSED,
          endedAt: new Date(),
          systemHandoverTotal: minorToAmountString(systemMinor),
          declaredHandoverTotal:
            dto.declaredHandoverTotal !== undefined
              ? dto.declaredHandoverTotal.toFixed(4)
              : null,
          ordersSettledCount: pending.length,
          confirmedByManagerId: managerId,
          confirmedAt: new Date(),
        },
      });
      return {
        settledOrderCount: pending.length,
        systemHandoverTotal: minorToAmountString(systemMinor),
        shiftId: shift.id,
      };
    });
  }
}
