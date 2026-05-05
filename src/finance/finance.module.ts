import { Module } from '@nestjs/common';
import { GeneralLedgerModule } from '../general-ledger/general-ledger.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BankDepositsController } from './bank-deposits.controller';
import { BankDepositsService } from './bank-deposits.service';
import { DepositsController } from './deposits.controller';
import { DepositsService } from './deposits.service';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { CashService } from './services/cash.service';
import { DebtService } from './services/debt.service';
import { OnlinePaymentService } from './services/online-payment.service';
import { SubscriptionService } from './services/subscription.service';
import { AccountantDashboardService } from './services/accountant-dashboard.service';
import { CustomerIntelligenceService } from './services/customer-intelligence.service';
import { DriverRiskService } from './services/driver-risk.service';
import { FinanceDashboardCacheService } from './services/finance-dashboard-cache.service';
import { FinancialAlertsService } from './services/financial-alerts.service';
import { OwnerFinancialDashboardService } from './services/owner-financial-dashboard.service';
import { LedgerController } from './ledger/ledger.controller';
import { LedgerProjectionService } from './ledger/ledger-projection.service';

@Module({
  imports: [PrismaModule, PaymentsModule, GeneralLedgerModule],
  controllers: [
    FinanceController,
    BankDepositsController,
    DepositsController,
    LedgerController,
  ],
  providers: [
    FinanceService,
    BankDepositsService,
    DepositsService,
    CashService,
    OnlinePaymentService,
    DebtService,
    SubscriptionService,
    FinanceDashboardCacheService,
    AccountantDashboardService,
    CustomerIntelligenceService,
    DriverRiskService,
    FinancialAlertsService,
    OwnerFinancialDashboardService,
    LedgerProjectionService,
  ],
  exports: [
    FinanceService,
    BankDepositsService,
    DepositsService,
    CashService,
    DebtService,
    SubscriptionService,
    OwnerFinancialDashboardService,
    LedgerProjectionService,
  ],
})
export class FinanceModule {}
