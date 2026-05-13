import { Injectable } from '@nestjs/common';
import {
  ManagerCashCustodyStatus,
  Prisma,
  SafariRole,
} from '@prisma/client';
import { DebtEntityCategory } from './enums/debt-entity-category.enum';
import { PrismaService } from '../prisma/prisma.service';
import { ConfirmHandoverDto } from './dto/confirm-handover.dto';
import type {
  DriverBalanceResponseDto,
  HandoverResultDto,
} from './dto/driver-balance.dto';
import type { CashReconciliationSnapshotDto } from './dto/cash-reconciliation.dto';
import type {
  DriverCashTraceQueryDto,
  DriverCashTraceResponseDto,
} from './dto/driver-cash-trace.dto';
import type { OwnerCustomerWalletSummaryDto } from './dto/owner-customer-wallet-summary.dto';
import type {
  UnpaidInvoicesQueryDto,
  UnpaidInvoicesResponseDto,
} from './dto/unpaid-invoices.dto';
import type { UpdateDriverTrackingDto } from './dto/update-driver-tracking.dto';
import { CashService } from './services/cash.service';
import { DebtService } from './services/debt.service';
import { OnlinePaymentService } from './services/online-payment.service';
import { SubscriptionService } from './services/subscription.service';

/**
 * A3.D8 — consolidated snapshot of every KD-denominated pool of cash
 * the institution currently holds. Returned by
 * GET /api/finance/consolidated-cash for the Owner dashboard.
 */
export type ConsolidatedCashSnapshotDto = {
  atIso: string;
  driverFieldCashKd: string;
  managerCustodyPendingKd: string;
  branchWalletsKd: string;
  unverifiedBankDepositsKd: string;
  totalKd: string;
  breakdown: {
    /** Count of drivers currently holding CASH that has not been handed over. */
    driverCount: number;
    /** Count of custody bags awaiting deposit or verification. */
    custodyBagCount: number;
    /** Count of branch wallet rows (by branchId). */
    branchWalletCount: number;
    /** Count of BankDepositLog rows still pending accountant verification. */
    unverifiedBankDepositCount: number;
  };
};

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cashService: CashService,
    private readonly debtService: DebtService,
    private readonly onlinePaymentService: OnlinePaymentService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  async ensureOpenShiftForDriver(driverId: string): Promise<void> {
    return this.cashService.ensureOpenShiftForDriver(driverId);
  }

  async getDailyPosSalesByPaymentMethod(
    fromIso: string,
    toIso: string,
    scopedDriverId?: string,
  ) {
    return this.cashService.getDailyPosSalesByPaymentMethod(
      fromIso,
      toIso,
      scopedDriverId,
    );
  }

  async getOwnerCustomerWalletSummary(): Promise<OwnerCustomerWalletSummaryDto> {
    return this.debtService.getOwnerCustomerWalletSummary();
  }

  async getDebtBreakdownByCategory(
    fromIso: string,
    toIso: string,
    category?: DebtEntityCategory,
    branchId?: string,
    actorUserId?: string,
  ) {
    return this.debtService.getDebtBreakdownByCategory(
      fromIso,
      toIso,
      category,
      branchId,
      actorUserId,
    );
  }

  async getOpenDebtByIssuer(branchId?: string) {
    return this.debtService.getOpenDebtByIssuer(branchId);
  }

  async getDriverBalances(): Promise<DriverBalanceResponseDto> {
    return this.cashService.getDriverBalances();
  }

  async getMyDriverCashCustodySummary(driverId: string) {
    return this.cashService.getMyDriverCashCustodySummary(driverId);
  }

  async getDriverMonitoring(branchId: string | null = null) {
    return this.cashService.getDriverMonitoring(branchId);
  }

  async updateDriverTracking(driverId: string, dto: UpdateDriverTrackingDto) {
    return this.cashService.updateDriverTracking(driverId, dto);
  }

  async confirmHandover(
    managerId: string,
    actorRole: SafariRole,
    dto: ConfirmHandoverDto,
  ): Promise<HandoverResultDto> {
    return this.cashService.confirmHandover(managerId, actorRole, dto);
  }

  async getCashReconciliationSnapshot(
    query: DriverCashTraceQueryDto,
  ): Promise<CashReconciliationSnapshotDto> {
    return this.cashService.getCashReconciliationSnapshot(query);
  }

  /**
   * OWNER: trace each CASH order through manager collection and accountant verification.
   */
  async getOwnerFinancialCycleReport() {
    return this.cashService.getOwnerFinancialCycleReport();
  }

  /**
   * V19.10 — per-driver cash trace: collected → manager custody → bank.
   */
  async getDriverCashTrace(
    query: DriverCashTraceQueryDto,
  ): Promise<DriverCashTraceResponseDto> {
    return this.cashService.getDriverCashTrace(query);
  }

  /**
   * V19.10 — "Unpaid invoices list" (قائمة مديونيات الفواتير).
   */
  async getUnpaidInvoices(
    query: UnpaidInvoicesQueryDto,
  ): Promise<UnpaidInvoicesResponseDto> {
    return this.debtService.getUnpaidInvoices(query);
  }

  async getOutstandingDebtsWithoutLinks(branchId: string | null = null) {
    return this.debtService.getOutstandingDebtsWithoutLinks(branchId);
  }

  async generateSettlementLink(
    customerId: string,
    invoiceIds: string[],
    actorUserId: string,
  ) {
    return this.debtService.generateSettlementLink({
      customerId,
      invoiceIds,
      actorUserId,
    });
  }

  /**
   * A3.D8 — single endpoint that aggregates every pool of KD cash the
   * institution holds right now. Fixes the Owner's "I have three
   * different dashboards, all with slightly different cash totals"
   * complaint: the Financial Cycle card, the Debt Radar, and the
   * Executive P&L each looked at a subset. This snapshot is the sum.
   *
   * Sources (all KWD):
   *   1. Driver field cash    — CASH orders PAID_TO_DRIVER
   *   2. Manager custody      — ManagerCashCustody rows in PENDING_DEPOSIT
   *                             or AWAITING_VERIFICATION
   *   3. Branch wallets       — Wallet table balance (currency=KWD)
   *   4. Unverified bank logs — BankDepositLog rows with verifiedAt IS NULL
   */
  async getConsolidatedCashSnapshot(): Promise<ConsolidatedCashSnapshotDto> {
    const [
      driverCashKd,
      custodyAgg,
      walletAgg,
      unverifiedAgg,
      distinctDriversHoldingCash,
    ] = await Promise.all([
      this.cashService.getTotalCashWithDrivers(),
      this.prisma.managerCashCustody.aggregate({
        where: {
          status: {
            in: [
              ManagerCashCustodyStatus.PENDING_DEPOSIT,
              ManagerCashCustodyStatus.AWAITING_VERIFICATION,
            ],
          },
        },
        _sum: { amountKd: true },
        _count: { _all: true },
      }),
      this.prisma.wallet.aggregate({
        where: { currency: 'KWD' },
        _sum: { balance: true },
        _count: { _all: true },
      }),
      this.prisma.bankDepositLog.aggregate({
        where: { verifiedAt: null },
        _sum: { amountKd: true },
        _count: { _all: true },
      }),
      this.prisma.order.groupBy({
        by: ['driverId'],
        where: {
          status: 'COMPLETED',
          cashStatus: 'PAID_TO_DRIVER',
          posPaymentMethod: 'CASH',
        },
      }),
    ]);

    const toDec = (v: Prisma.Decimal | null | undefined): Prisma.Decimal =>
      v ? new Prisma.Decimal(v.toString()) : new Prisma.Decimal(0);

    const driverField = new Prisma.Decimal(driverCashKd);
    const custody = toDec(custodyAgg._sum.amountKd);
    const wallets = toDec(walletAgg._sum.balance);
    const unverified = toDec(unverifiedAgg._sum.amountKd);
    const total = driverField.plus(custody).plus(wallets).plus(unverified);

    return {
      atIso: new Date().toISOString(),
      driverFieldCashKd: driverField.toFixed(4),
      managerCustodyPendingKd: custody.toFixed(4),
      branchWalletsKd: wallets.toFixed(4),
      unverifiedBankDepositsKd: unverified.toFixed(4),
      totalKd: total.toFixed(4),
      breakdown: {
        driverCount: distinctDriversHoldingCash.length,
        custodyBagCount: custodyAgg._count._all,
        branchWalletCount: walletAgg._count._all,
        unverifiedBankDepositCount: unverifiedAgg._count._all,
      },
    };
  }

  async getRealtimeTotals() {
    const [cashTotal, onlineTotal, debtTotal, usage] = await Promise.all([
      this.cashService.getTotalCashWithDrivers(),
      this.onlinePaymentService.getTotalOnlineRevenue(),
      this.debtService.getTotalDebt(),
      this.subscriptionService.getUsageAndSettledDebtTotals(),
    ]);
    return {
      totalCash: cashTotal,
      totalOnline: onlineTotal,
      totalDebt: debtTotal,
      totalSubscriptionUsage: usage.totalSubscriptionUsage,
    };
  }
}
