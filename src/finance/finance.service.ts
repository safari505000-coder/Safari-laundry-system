import { Injectable } from '@nestjs/common';
import { DebtEntityCategory } from '@prisma/client';
import { ConfirmHandoverDto } from './dto/confirm-handover.dto';
import type {
  DriverBalanceResponseDto,
  HandoverResultDto,
} from './dto/driver-balance.dto';
import type { OwnerCustomerWalletSummaryDto } from './dto/owner-customer-wallet-summary.dto';
import type { UpdateDriverTrackingDto } from './dto/update-driver-tracking.dto';
import { CashService } from './services/cash.service';
import { DebtService } from './services/debt.service';
import { OnlinePaymentService } from './services/online-payment.service';
import { SubscriptionService } from './services/subscription.service';

@Injectable()
export class FinanceService {
  constructor(
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

  async getDriverBalances(): Promise<DriverBalanceResponseDto> {
    return this.cashService.getDriverBalances();
  }

  async getDriverMonitoring() {
    return this.cashService.getDriverMonitoring();
  }

  async updateDriverTracking(driverId: string, dto: UpdateDriverTrackingDto) {
    return this.cashService.updateDriverTracking(driverId, dto);
  }

  async confirmHandover(
    managerId: string,
    dto: ConfirmHandoverDto,
  ): Promise<HandoverResultDto> {
    return this.cashService.confirmHandover(managerId, dto);
  }

  /**
   * OWNER: trace each CASH order through manager collection and accountant verification.
   */
  async getOwnerFinancialCycleReport() {
    return this.cashService.getOwnerFinancialCycleReport();
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
