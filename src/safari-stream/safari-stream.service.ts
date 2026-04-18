import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CashStatus,
  DepositStatus,
  ExpenseStatus,
  OrderStatus,
  PosPaymentMethod,
  Prisma,
  SafariRole,
} from '@prisma/client';
import { LaundryPriceListService } from '../laundry-price-list/laundry-price-list.service';
import { ManagerCustodyService } from '../manager-custody/manager-custody.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { OperatingHoursService } from '../system/operating-hours.service';

export type SafariStreamSnapshotDto = {
  stream: 'safari-erp-v1';
  user: {
    id: string;
    username: string;
    fullName: string;
    phone: string | null;
    safariRole: SafariRole;
    branchId: string | null;
  };
  wallet: {
    /** Driver field cash net of approved expenses and pending deposit holds. */
    fieldCashAvailableKd: string | null;
    pendingDepositHoldKd: string | null;
    /** Driver-attributed completed debt-on-account volume (reporting). */
    pendingDebtOrdersKd: string | null;
  };
  /** Accountant radar: fleet field cash, pending deposits, financial-day net (null for other roles). */
  institution: {
    allDriversFieldCashKd: string;
    allDriversPendingDepositsKd: string;
    financialDayNetProfitKd: string;
    financialDateIso: string;
  } | null;
  permissions: string[];
  /**
   * Monotonically-increasing catalog version. Changes when the Owner edits any
   * price/category/branch-override. Clients (notably Driver POS) compare this
   * between snapshots and reload their cached laundry price list on change.
   */
  priceListVersion: string;
  /**
   * Dastur §3 — Manager custody aging alerts.
   * - fleet.* is only populated for OWNER / ACCOUNTANT (alert surface).
   * - mine.*  is only populated for MANAGER (my pending bags).
   */
  managerCustody: {
    fleet: {
      pendingAmountKd: string;
      overdueCount: number;
      overdueAmountKd: string;
    } | null;
    mine: {
      pendingCount: number;
      pendingAmountKd: string;
      overdueCount: number;
    } | null;
  };
};

@Injectable()
export class SafariStreamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
    private readonly operatingHours: OperatingHoursService,
    private readonly reportsService: ReportsService,
    private readonly laundryPriceListService: LaundryPriceListService,
    private readonly managerCustodyService: ManagerCustodyService,
  ) {}

  private async buildInstitutionRadar(): Promise<NonNullable<SafariStreamSnapshotDto['institution']>> {
    const status = this.operatingHours.getStatusPayload();
    const fin = status.financialDateIso;
    const fromKuwait = new Date(`${fin}T00:00:00+03:00`);
    const toKuwait = new Date(`${fin}T23:59:59.999+03:00`);

    const [cashGroups, expGroups, depGroups, pendingAll, exec] =
      await Promise.all([
        this.prisma.order.groupBy({
          by: ['driverId'],
          where: {
            status: OrderStatus.COMPLETED,
            cashStatus: CashStatus.PAID_TO_DRIVER,
            posPaymentMethod: PosPaymentMethod.CASH,
            driverId: { not: null },
          },
          _sum: { totalPrice: true },
        }),
        this.prisma.branchExpense.groupBy({
          by: ['recordedById'],
          where: {
            status: { in: [ExpenseStatus.APPROVED, ExpenseStatus.AUDIT] },
            recordedBy: { safariRole: SafariRole.DRIVER },
          },
          _sum: { amount: true },
        }),
        this.prisma.deposit.groupBy({
          by: ['driverId'],
          where: { status: DepositStatus.PENDING },
          _sum: { amount: true },
        }),
        this.prisma.deposit.aggregate({
          where: { status: DepositStatus.PENDING },
          _sum: { amount: true },
        }),
        this.reportsService.netProfitExecutive(
          fromKuwait.toISOString(),
          toKuwait.toISOString(),
          undefined,
          undefined,
        ),
      ]);

    const cashByDriver = new Map<string, Prisma.Decimal>();
    for (const g of cashGroups) {
      if (g.driverId) {
        cashByDriver.set(
          g.driverId,
          new Prisma.Decimal(g._sum.totalPrice?.toString() ?? '0'),
        );
      }
    }
    const expByDriver = new Map<string, Prisma.Decimal>();
    for (const g of expGroups) {
      expByDriver.set(
        g.recordedById,
        new Prisma.Decimal(g._sum.amount?.toString() ?? '0'),
      );
    }
    const depByDriver = new Map<string, Prisma.Decimal>();
    for (const g of depGroups) {
      depByDriver.set(
        g.driverId,
        new Prisma.Decimal(g._sum.amount?.toString() ?? '0'),
      );
    }
    const ids = new Set<string>();
    for (const k of cashByDriver.keys()) ids.add(k);
    for (const k of expByDriver.keys()) ids.add(k);
    for (const k of depByDriver.keys()) ids.add(k);
    let fieldTotal = new Prisma.Decimal(0);
    for (const id of ids) {
      const c = cashByDriver.get(id) ?? new Prisma.Decimal(0);
      const e = expByDriver.get(id) ?? new Prisma.Decimal(0);
      const p = depByDriver.get(id) ?? new Prisma.Decimal(0);
      fieldTotal = fieldTotal.add(c.sub(e).sub(p));
    }

    const pend = new Prisma.Decimal(
      pendingAll._sum.amount?.toString() ?? '0',
    );

    return {
      allDriversFieldCashKd: fieldTotal.toFixed(4),
      allDriversPendingDepositsKd: pend.toFixed(4),
      financialDayNetProfitKd: exec.netProfitKd,
      financialDateIso: fin,
    };
  }

  async buildSnapshot(
    userId: string,
    jwtRole: string,
  ): Promise<SafariStreamSnapshotDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        fullName: true,
        phone: true,
        safariRole: true,
        branchId: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const permissionKeys =
      await this.permissionsService.listPermissionKeysForRoleName(jwtRole);

    let fieldCashAvailableKd: string | null = null;
    let pendingDepositHoldKd: string | null = null;
    let pendingDebtOrdersKd: string | null = null;

    if (user.safariRole === SafariRole.DRIVER) {
      const [cashSum, expSum, depSum, debtSum] = await Promise.all([
        this.prisma.order.aggregate({
          where: {
            driverId: userId,
            status: OrderStatus.COMPLETED,
            cashStatus: CashStatus.PAID_TO_DRIVER,
            posPaymentMethod: PosPaymentMethod.CASH,
          },
          _sum: { totalPrice: true },
        }),
        this.prisma.branchExpense.aggregate({
          where: {
            recordedById: userId,
            status: { in: [ExpenseStatus.APPROVED, ExpenseStatus.AUDIT] },
          },
          _sum: { amount: true },
        }),
        this.prisma.deposit.aggregate({
          where: { driverId: userId, status: DepositStatus.PENDING },
          _sum: { amount: true },
        }),
        this.prisma.order.aggregate({
          where: {
            driverId: userId,
            status: OrderStatus.COMPLETED,
            posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
          },
          _sum: { totalPrice: true },
        }),
      ]);
      const cash = new Prisma.Decimal(cashSum._sum.totalPrice?.toString() ?? '0');
      const exp = new Prisma.Decimal(expSum._sum.amount?.toString() ?? '0');
      const pend = new Prisma.Decimal(depSum._sum.amount?.toString() ?? '0');
      const debt = new Prisma.Decimal(debtSum._sum.totalPrice?.toString() ?? '0');
      fieldCashAvailableKd = cash.sub(exp).sub(pend).toFixed(4);
      pendingDepositHoldKd = pend.toFixed(4);
      pendingDebtOrdersKd = debt.toFixed(4);
    }

    let institution: SafariStreamSnapshotDto['institution'] = null;
    if (user.safariRole === SafariRole.ACCOUNTANT) {
      institution = await this.buildInstitutionRadar();
    }

    const priceListVersion = await this.laundryPriceListService.getCatalogVersion();

    // Dastur §3 — populate custody alert block only where it's meaningful.
    let managerCustodyFleet: SafariStreamSnapshotDto['managerCustody']['fleet'] =
      null;
    let managerCustodyMine: SafariStreamSnapshotDto['managerCustody']['mine'] =
      null;
    if (
      user.safariRole === SafariRole.OWNER ||
      user.safariRole === SafariRole.ACCOUNTANT
    ) {
      const m = await this.managerCustodyService.getStreamMetrics();
      managerCustodyFleet = {
        pendingAmountKd: m.fleetPendingAmountKd,
        overdueCount: m.fleetOverdueCount,
        overdueAmountKd: m.fleetOverdueAmountKd,
      };
    }
    if (user.safariRole === SafariRole.MANAGER) {
      const m = await this.managerCustodyService.getStreamMetrics();
      const mine = m.pendingByManager.find((r) => r.managerId === userId);
      // Overdue count for this manager = per-manager pending rows that are >=24h.
      // Light-weight: use aging listing scoped to the manager.
      const myAging = await this.managerCustodyService.listAging({
        managerId: userId,
      });
      managerCustodyMine = {
        pendingCount: mine?.count ?? 0,
        pendingAmountKd: mine?.amountKd ?? '0.0000',
        overdueCount: myAging.summary.overdueCount,
      };
    }

    return {
      stream: 'safari-erp-v1',
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        phone: user.phone,
        safariRole: user.safariRole,
        branchId: user.branchId,
      },
      wallet: {
        fieldCashAvailableKd,
        pendingDepositHoldKd,
        pendingDebtOrdersKd,
      },
      institution,
      permissions: permissionKeys,
      priceListVersion,
      managerCustody: {
        fleet: managerCustodyFleet,
        mine: managerCustodyMine,
      },
    };
  }
}
