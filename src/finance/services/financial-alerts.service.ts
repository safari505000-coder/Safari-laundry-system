import { Injectable } from '@nestjs/common';
import { ExpenseStatus, Prisma } from '@prisma/client';
import type {
  FinancialAlertDto,
  FinancialAlertSeverity,
  OwnerTopCustomerDto,
  RiskyDriverDto,
} from '../dto/owner-financial-dashboard.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { DriverRiskService } from './driver-risk.service';

@Injectable()
export class FinancialAlertsService {
  constructor(private readonly driverRisk: DriverRiskService) {}

  async buildAlerts(input: {
    topCustomers: OwnerTopCustomerDto[];
    riskyDrivers?: RiskyDriverDto[];
    reconciliationDifferenceKd: string;
    expenseCurrentKd: string;
    expensePreviousKd: string;
    now?: Date;
  }): Promise<FinancialAlertDto[]> {
    const now = input.now ?? new Date();
    const riskyDrivers =
      input.riskyDrivers ?? (await this.driverRisk.getRiskyDrivers(10));
    const alerts: FinancialAlertDto[] = [];

    for (const customer of input.topCustomers) {
      if (Number.parseFloat(customer.totalDueKd) > 500) {
        alerts.push({
          type: 'HIGH_DEBT',
          severity: 'HIGH',
          entityId: customer.customerId,
          message: `${customer.displayName ?? customer.customerId}: outstanding ${customer.totalDueKd} KWD`,
          createdAt: now.toISOString(),
        });
      }
    }

    for (const driver of riskyDrivers) {
      if (driver.riskLevel === 'LOW') continue;
      alerts.push({
        type: 'DRIVER_DELAY',
        severity: driver.riskLevel === 'HIGH' ? 'HIGH' : 'MEDIUM',
        entityId: driver.driverId,
        message: `${driver.driverName ?? driver.driverId}: cash delay ${driver.delayHours}h, collected ${driver.collectedCash} KWD`,
        createdAt: now.toISOString(),
      });
    }

    const diff = Math.abs(Number.parseFloat(input.reconciliationDifferenceKd));
    if (Number.isFinite(diff) && diff > 0.001) {
      alerts.push({
        type: 'CASH_MISMATCH',
        severity: diff >= 10 ? 'HIGH' : 'MEDIUM',
        entityId: 'cash-reconciliation',
        message: `Cash reconciliation difference ${input.reconciliationDifferenceKd} KWD`,
        createdAt: now.toISOString(),
      });
    }

    const current = Number.parseFloat(input.expenseCurrentKd);
    const previous = Number.parseFloat(input.expensePreviousKd);
    if (Number.isFinite(current) && Number.isFinite(previous) && previous > 0 && current / previous >= 1.5) {
      alerts.push({
        type: 'EXPENSE_SPIKE',
        severity: 'LOW',
        entityId: 'expenses',
        message: `Expenses ${input.expenseCurrentKd} KWD vs ${input.expensePreviousKd} KWD previous window`,
        createdAt: now.toISOString(),
      });
    }

    return alerts.sort(
      (a, b) => severityRank(b.severity) - severityRank(a.severity) || a.type.localeCompare(b.type),
    );
  }

  async expenseWindowTotals(
    prisma: PrismaService,
    current: { from: Date; to: Date },
    previous: { from: Date; to: Date },
  ) {
    const [cur, prev] = await Promise.all([
      prisma.branchExpense.aggregate({
        where: {
          status: ExpenseStatus.APPROVED,
          expenseDate: { gte: current.from, lte: current.to },
        },
        _sum: { amount: true },
      }),
      prisma.branchExpense.aggregate({
        where: {
          status: ExpenseStatus.APPROVED,
          expenseDate: { gte: previous.from, lte: previous.to },
        },
        _sum: { amount: true },
      }),
    ]);
    return {
      currentKd: cur._sum?.amount?.toFixed(4) ?? '0.0000',
      previousKd: prev._sum?.amount?.toFixed(4) ?? '0.0000',
    };
  }
}

function severityRank(severity: FinancialAlertSeverity): number {
  if (severity === 'HIGH') return 3;
  if (severity === 'MEDIUM') return 2;
  return 1;
}
