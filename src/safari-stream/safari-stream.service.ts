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
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';

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
  permissions: string[];
};

@Injectable()
export class SafariStreamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
  ) {}

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
      permissions: permissionKeys,
    };
  }
}
