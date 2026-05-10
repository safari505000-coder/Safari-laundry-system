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

/** V23.2 — High-debt alert threshold (canonical receivable, KWD). */
const HIGH_DEBT_THRESHOLD_KD = new Prisma.Decimal('500');
/** V23.2 — Cash mismatch tolerance below which no alert fires. */
const CASH_MISMATCH_TOLERANCE_KD = new Prisma.Decimal('0.001');
/** V23.2 — Cash mismatch escalation threshold (HIGH severity). */
const CASH_MISMATCH_HIGH_KD = new Prisma.Decimal('10');

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
      // V23.2 — Canonical receivable comparison via Prisma.Decimal
      // (no JS number coercion on a money field). The threshold
      // string keeps the rule self-documenting: 500 KWD outstanding.
      const receivable = new Prisma.Decimal(customer.canonicalDebtKd);
      if (receivable.greaterThan(HIGH_DEBT_THRESHOLD_KD)) {
        alerts.push({
          type: 'HIGH_DEBT',
          severity: 'HIGH',
          entityId: customer.customerId,
          message: `${customer.displayName ?? customer.customerId}: outstanding ${customer.canonicalDebtKd} KWD`,
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

    // V23.2 — Decimal-precise reconciliation gap. The legacy code
    // used `Number.parseFloat`+`Math.abs` which silently coerced a
    // money string into JS double precision; Prisma.Decimal keeps
    // exact arithmetic and matches the canonical money invariant.
    const diff = new Prisma.Decimal(input.reconciliationDifferenceKd).abs();
    if (diff.greaterThan(CASH_MISMATCH_TOLERANCE_KD)) {
      alerts.push({
        type: 'CASH_MISMATCH',
        severity: diff.greaterThanOrEqualTo(CASH_MISMATCH_HIGH_KD) ? 'HIGH' : 'MEDIUM',
        entityId: 'cash-reconciliation',
        message: `Cash reconciliation difference ${input.reconciliationDifferenceKd} KWD`,
        createdAt: now.toISOString(),
      });
    }

    // V23.2 — Decimal-precise spike ratio. We avoid `current /
    // previous` on JS doubles by computing `current * 2 >= previous * 3`
    // which is the integer-arithmetic equivalent of `>= 1.5×`.
    const current = new Prisma.Decimal(input.expenseCurrentKd);
    const previous = new Prisma.Decimal(input.expensePreviousKd);
    if (
      previous.greaterThan(0) &&
      current.times(2).greaterThanOrEqualTo(previous.times(3))
    ) {
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
