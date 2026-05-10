import { Module } from '@nestjs/common';
import { CustomerNotificationsModule } from '../customer-notifications/customer-notifications.module';
import { GeneralLedgerModule } from '../general-ledger/general-ledger.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BankDepositsController } from './bank-deposits.controller';
import { BankDepositsService } from './bank-deposits.service';
import { DepositsController } from './deposits.controller';
import { DepositsService } from './deposits.service';
import { FinanceController } from './finance.controller';
import { JournalController } from './journal.controller';
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
import { FinancialAuditController } from './audit/financial-audit.controller';
import { FinancialAuditService } from './audit/financial-audit.service';
import { UiDriftInspectorService } from './audit/ui-drift-inspector.service';
import { InvoicePaymentStatusService } from './invoice-payment-status.service';
import { InvoicePaymentStatusController } from './invoice-payment-status.controller';
import { ReconciliationService } from './reconciliation/reconciliation.service';
import { ReconciliationController } from './reconciliation/reconciliation.controller';
import { AgingService } from './aging/aging.service';
import { AgingController } from './aging/aging.controller';
import { PromisesToPayService } from './promises/promises.service';
import { PromisesToPayController } from './promises/promises.controller';
import { CollectionsWorkflowService } from './collections/collections-workflow.service';
import { CollectionsWorkflowController } from './collections/collections-workflow.controller';
// V20.6 — Phase 1: PeriodsModule is now a @Global() module imported
// from AppModule, so FinancialPeriodsService is available everywhere
// (including DoubleEntryJournalService in GeneralLedgerModule) without
// forwardRef. The service is no longer declared as a FinanceModule
// provider — both modules would otherwise create two distinct
// instances and break the lock guard.
import { RiskScoringService } from './risk/risk-scoring.service';
import { RiskScoringController } from './risk/risk-scoring.controller';
import { FraudDetectionService } from './fraud/fraud-detection.service';
import { FraudDetectionController } from './fraud/fraud-detection.controller';
import { BranchAccountingService } from './branches/branch-accounting.service';
import { BranchAccountingController } from './branches/branch-accounting.controller';
import { FinancialObservabilityService } from './observability/financial-observability.service';
import { FinancialObservabilityController } from './observability/financial-observability.controller';

@Module({
  imports: [
    PrismaModule,
    PaymentsModule,
    GeneralLedgerModule,
    CustomerNotificationsModule,
  ],
  controllers: [
    FinanceController,
    JournalController,
    BankDepositsController,
    DepositsController,
    LedgerController,
    FinancialAuditController,
    InvoicePaymentStatusController,
    ReconciliationController,
    AgingController,
    PromisesToPayController,
    CollectionsWorkflowController,
    // FinancialPeriodsController moved to PeriodsModule (V20.6 Phase 1)
    RiskScoringController,
    FraudDetectionController,
    BranchAccountingController,
    FinancialObservabilityController,
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
    FinancialAuditService,
    UiDriftInspectorService,
    InvoicePaymentStatusService,
    ReconciliationService,
    AgingService,
    PromisesToPayService,
    CollectionsWorkflowService,
    // FinancialPeriodsService moved to PeriodsModule (V20.6 Phase 1)
    RiskScoringService,
    FraudDetectionService,
    BranchAccountingService,
    FinancialObservabilityService,
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
    InvoicePaymentStatusService,
    ReconciliationService,
    AgingService,
    PromisesToPayService,
    CollectionsWorkflowService,
    // FinancialPeriodsService no longer re-exported here — consumers
    // either inject it directly (the Global PeriodsModule makes it
    // available everywhere) or import the service via its module path.
    RiskScoringService,
    FraudDetectionService,
    BranchAccountingService,
    FinancialObservabilityService,
  ],
})
export class FinanceModule {}
