import { Injectable } from '@nestjs/common';
import {
  CashStatus,
  ManagerCashCustodyStatus,
  OrderStatus,
  PosPaymentMethod,
  Prisma,
  SafariRole,
} from '@prisma/client';
import type { RiskyDriverDto, DriverRiskLevel } from '../dto/owner-financial-dashboard.dto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DriverRiskService {
  constructor(private readonly prisma: PrismaService) {}

  async getRiskyDrivers(take = 10): Promise<RiskyDriverDto[]> {
    const drivers = await this.prisma.user.findMany({
      where: { safariRole: SafariRole.DRIVER },
      select: { id: true, fullName: true, username: true },
      orderBy: { username: 'asc' },
      take: 300,
    });
    const rows = await Promise.all(
      drivers.map(async (driver) => {
        const [cashOrders, handedAgg] = await Promise.all([
          this.prisma.order.findMany({
            where: {
              driverId: driver.id,
              status: OrderStatus.COMPLETED,
              cashStatus: CashStatus.PAID_TO_DRIVER,
              posPaymentMethod: PosPaymentMethod.CASH,
              completedAt: { not: null },
            },
            select: { totalPrice: true, completedAt: true },
            orderBy: { completedAt: 'asc' },
            take: 500,
          }),
          this.prisma.managerCashCustody.aggregate({
            where: {
              driverId: driver.id,
              status: {
                in: [
                  ManagerCashCustodyStatus.PENDING_DEPOSIT,
                  ManagerCashCustodyStatus.AWAITING_VERIFICATION,
                  ManagerCashCustodyStatus.VERIFIED,
                ],
              },
            },
            _sum: { amountKd: true },
          }),
        ]);
        const collected = cashOrders.reduce(
          (sum, order) => sum.plus(order.totalPrice),
          new Prisma.Decimal(0),
        );
        const handed = handedAgg._sum.amountKd ?? new Prisma.Decimal(0);
        const oldest = cashOrders[0]?.completedAt ?? null;
        const delayHours =
          oldest ? Math.max((Date.now() - oldest.getTime()) / 3600000, 0) : 0;
        const riskLevel = riskFor(delayHours, handed, collected);
        return {
          driverId: driver.id,
          driverName: driver.fullName ?? driver.username ?? null,
          collectedCash: collected.toFixed(4),
          handedCash: handed.toFixed(4),
          delayHours: Math.round(delayHours * 100) / 100,
          riskLevel,
        };
      }),
    );

    return rows
      .filter((row) => row.riskLevel !== 'LOW')
      .sort((a, b) => riskRank(b.riskLevel) - riskRank(a.riskLevel) || b.delayHours - a.delayHours)
      .slice(0, take);
  }
}

function riskFor(
  delayHours: number,
  handed: Prisma.Decimal,
  collected: Prisma.Decimal,
): DriverRiskLevel {
  if (delayHours > 48) return 'HIGH';
  if (delayHours > 24) return 'MEDIUM';
  if (handed.lt(collected)) return 'WARNING';
  return 'LOW';
}

function riskRank(level: DriverRiskLevel): number {
  if (level === 'HIGH') return 4;
  if (level === 'MEDIUM') return 3;
  if (level === 'WARNING') return 2;
  return 1;
}
