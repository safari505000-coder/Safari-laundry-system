import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashStatus,
  DebtEntityCategory,
  DebtSource,
  LedgerTransactionType,
  OrderStatus,
  PosPaymentMethod,
  Prisma,
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

const KUWAIT_OFFSET_MIN = 180; // UTC+03:00, no DST.

function kuwaitNow(): Date {
  return new Date(Date.now() + KUWAIT_OFFSET_MIN * 60_000);
}

/** Midnight (00:00 Kuwait) expressed as a UTC Date. */
function kuwaitMidnightUtc(nowUtc: Date): Date {
  const k = new Date(nowUtc.getTime() + KUWAIT_OFFSET_MIN * 60_000);
  const y = k.getUTCFullYear();
  const m = k.getUTCMonth();
  const d = k.getUTCDate();
  const utcMs = Date.UTC(y, m, d, 0, 0, 0, 0) - KUWAIT_OFFSET_MIN * 60_000;
  return new Date(utcMs);
}

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
      orderBy: { startedAt: 'desc' },
    });
    if (open) {
      const nowUtc = new Date();
      const midnightUtc = kuwaitMidnightUtc(nowUtc);
      // Auto-lock any shift that spans into the new financial day.
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
    const negativeBalanceRows = await this.prisma.customerWallet.findMany({
      where: { balance: { lt: 0 } },
      select: { balance: true },
    });
    const subscriptionDebtMinor = negativeBalanceRows.reduce((acc, row) => {
      const x = Number.parseFloat(row.balance.toString());
      if (!Number.isFinite(x) || x >= 0) return acc;
      return acc + Math.abs(x);
    }, 0);
    const txRows = await this.prisma.transactionHistory.findMany({
      where: {
        OR: [
          { type: LedgerTransactionType.ORDER_WALLET_SETTLEMENT },
          { type: LedgerTransactionType.SUBSCRIPTION_ACTIVATION },
        ],
      },
      select: { type: true, metadata: true },
    });
    const debtRows = await this.prisma.debtLedgerEntry.groupBy({
      by: ['source', 'category'],
      _sum: { amount: true },
    });
    let debtFromIssuedInvoices = 0;
    let debtFromSubscriptionOveruse = 0;
    let debtSettledBySubscriptions = 0;
    let debtByBranch = 0;
    let debtByDriver = 0;
    let debtByOwner = 0;
    let debtByCallCenter = 0;
    let totalSubscriptionUsage = 0;
    for (const row of debtRows) {
      const amount = Number.parseFloat(row._sum.amount?.toString() ?? '0');
      if (!Number.isFinite(amount) || amount <= 0) continue;
      if (row.source === DebtSource.INVOICE_SHORTFALL) {
        debtFromIssuedInvoices += amount;
      } else if (row.source === DebtSource.SUBSCRIPTION_OVERUSE) {
        debtFromSubscriptionOveruse += amount;
      }
      if (row.category === DebtEntityCategory.BRANCH) debtByBranch += amount;
      else if (row.category === DebtEntityCategory.DRIVER) debtByDriver += amount;
      else if (row.category === DebtEntityCategory.OWNER) debtByOwner += amount;
      else if (row.category === DebtEntityCategory.CALL_CENTER) {
        debtByCallCenter += amount;
      }
    }
    for (const row of txRows) {
      const meta = row.metadata as
        | {
            addedToDebt?: unknown;
            debtSettled?: unknown;
            appliedFromWallet?: unknown;
          }
        | null
        | undefined;
      if (row.type === LedgerTransactionType.ORDER_WALLET_SETTLEMENT) {
        const used = Number.parseFloat(String(meta?.appliedFromWallet ?? '0'));
        if (Number.isFinite(used) && used > 0) {
          totalSubscriptionUsage += used;
        }
        const n = Number.parseFloat(String(meta?.addedToDebt ?? '0'));
        if (Number.isFinite(n) && n > 0 && debtFromIssuedInvoices <= 0) {
          debtFromIssuedInvoices += n;
        }
      } else if (row.type === LedgerTransactionType.SUBSCRIPTION_ACTIVATION) {
        const n = Number.parseFloat(String(meta?.debtSettled ?? '0'));
        if (Number.isFinite(n) && n > 0) debtSettledBySubscriptions += n;
      }
    }
    const standardInvoiceDebt = Number.parseFloat(
      agg._sum.debt !== null && agg._sum.debt !== undefined
        ? agg._sum.debt.toString()
        : '0',
    );
    const totalCustomerDebts = (standardInvoiceDebt + subscriptionDebtMinor).toFixed(4);
    return {
      totalWalletLiabilities:
        agg._sum.balance !== null && agg._sum.balance !== undefined
          ? agg._sum.balance.toString()
          : '0',
      totalCustomerDebts,
      debtFromIssuedInvoices: debtFromIssuedInvoices.toFixed(4),
      debtFromSubscriptionOveruse: debtFromSubscriptionOveruse.toFixed(4),
      debtSettledBySubscriptions: debtSettledBySubscriptions.toFixed(4),
      debtByBranch: debtByBranch.toFixed(4),
      debtByDriver: debtByDriver.toFixed(4),
      debtByOwner: debtByOwner.toFixed(4),
      debtByCallCenter: debtByCallCenter.toFixed(4),
      totalSubscriptionUsage: totalSubscriptionUsage.toFixed(4),
    };
  }

  async getDebtBreakdownByCategory(
    fromIso: string,
    toIso: string,
    category?: DebtEntityCategory,
  ) {
    const from = new Date(fromIso);
    const to = new Date(toIso);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid date range');
    }
    const where: Prisma.DebtLedgerEntryWhereInput = {
      createdAt: { gte: from, lte: to },
      ...(category ? { category } : {}),
    };
    const rows = await this.prisma.debtLedgerEntry.groupBy({
      by: ['category', 'source'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    });
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      rows: rows.map((r) => ({
        category: r.category,
        source: r.source,
        entryCount: r._count._all,
        totalDebt: r._sum.amount?.toString() ?? '0',
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
      const pending = await this.prisma.order.findMany({
        where: {
          driverId: d.id,
          status: OrderStatus.COMPLETED,
          cashStatus: CashStatus.PAID_TO_DRIVER,
          posPaymentMethod: PosPaymentMethod.CASH,
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
        branchId: d.branchId,
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
              bankDepositReceiptUrl: dto.depositReceiptUrl,
              confirmedByManagerId: managerId,
              confirmedAt: new Date(),
            },
          });
          return {
            settledOrderCount: 0,
            systemHandoverTotal: '0.0000',
            shiftId: shift.id,
            bankDepositReceiptUrl: dto.depositReceiptUrl,
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
          bankDepositReceiptUrl: dto.depositReceiptUrl,
          confirmedByManagerId: managerId,
          confirmedAt: new Date(),
        },
      });
      return {
        settledOrderCount: pending.length,
        systemHandoverTotal: minorToAmountString(systemMinor),
        shiftId: shift.id,
        bankDepositReceiptUrl: dto.depositReceiptUrl,
      };
    });
  }

  /**
   * OWNER: trace each CASH order through manager collection and accountant verification.
   */
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
