import { existsSync } from 'node:fs';
import { SecretsModule } from './common/config/secrets.module';
import { HttpDrainService } from './deployment/http-drain.service';
import { join } from 'node:path';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AccountingModule } from './accounting/accounting.module';
import { AttendanceModule } from './attendance/attendance.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { AuditLogsMiddleware } from './audit-logs/audit-logs.middleware';
import { AuthModule } from './auth/auth.module';
import { BranchesModule } from './branches/branches.module';
import { CallCenterModule } from './call-center/call-center.module';
import { CashIntelligenceModule } from './cash-intelligence/cash-intelligence.module';
import { CashMonitorModule } from './cash-monitor/cash-monitor.module';
import { CollectionsWorkflowModule } from './collections-workflow/collections-workflow.module';
import { CommissionsModule } from './commissions/commissions.module';
import { DebtHoldsModule } from './debt-holds/debt-holds.module';
import { InvoiceAuditModule } from './invoice-audit/invoice-audit.module';
import { OperatingHoursMiddleware } from './common/middleware/operating-hours.middleware';
import { ipReputationMiddleware } from './common/middleware/ip-reputation.middleware';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { requestContextMiddleware } from './common/tracing/request-async-context';
import { CustomersModule } from './customers/customers.module';
import { DebtTransfersModule } from './debt-transfers/debt-transfers.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { ExpensesModule } from './expenses/expenses.module';
import { FeedbackModule } from './feedback/feedback.module';
import { ExportsModule } from './exports/exports.module';
import { FixedExpenseModule } from './fixed-expenses/fixed-expense.module';
import { PayrollModule } from './payroll/payroll.module';
import { FinanceModule } from './finance/finance.module';
import { PeriodsModule } from './finance/periods/periods.module';
import { OutstandingModule } from './finance/outstanding/outstanding.module';
import { FinancialSnapshotsModule } from './finance/snapshots/snapshots.module';
import { DebtVisibilityModule } from './finance/debt-visibility/debt-visibility.module';
import { FinancialTimelineModule } from './finance/timeline/timeline.module';
import { CollectionsIntelligenceModule } from './finance/collections-intelligence/collections-intelligence.module';
import { SalesDebtAnalyticsModule } from './finance/sales-debt-analytics/sales-debt-analytics.module';
import { ReadModelsModule } from './read-models/read-models.module';
import { DomainEventsModule } from './domain-events/domain-events.module';
import { FinancialSnapshotListener } from './domain-events/handlers/financial-snapshot.listener';
import { HealthModule } from './health/health.module';
import { InsightsModule } from './insights/insights.module';
import { InventoryModule } from './inventory/inventory.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { QueueAdminModule } from './queue-admin/queue-admin.module';
import { LaundryPriceListModule } from './laundry-price-list/laundry-price-list.module';
import { LeavesModule } from './leaves/leaves.module';
import { LoansModule } from './loans/loans.module';
import { ManagerCustodyModule } from './manager-custody/manager-custody.module';
import { DriverOversightModule } from './driver-oversight/driver-oversight.module';
import { ManagerDocumentsModule } from './manager-documents/manager-documents.module';
import { OrdersModule } from './orders/orders.module';
import { ObservabilityModule } from './observability/observability.module';
import { OwnerDashboardModule } from './owner-dashboard/owner-dashboard.module';
import { PaymentMethodFeesModule } from './payment-method-fees/payment-method-fees.module';
import { PaymentsModule } from './payments/payments.module';
import { PermissionsModule } from './permissions/permissions.module';
import { PosModule } from './pos/pos.module';
import { PrismaModule } from './prisma/prisma.module';
import { PresenceModule } from './presence/presence.module';
import { SafariStreamModule } from './safari-stream/safari-stream.module';
import { ReportsModule } from './reports/reports.module';
import { SerialsModule } from './serials/serials.module';
import { ShiftsModule } from './shifts/shifts.module';
import { SystemModule } from './system/system.module';
import { SystemConfigModule } from './system-config/system-config.module';
import { SystemGuardianModule } from './system-guardian/system-guardian.module';
import { SystemSettingsModule } from './system-settings/system-settings.module';
import { SubscriptionPlansModule } from './subscription-plans/subscription-plans.module';
import { SubscribersModule } from './subscribers/subscribers.module';
import { UsersModule } from './users/users.module';
import { VehicleExpensesModule } from './vehicle-expenses/vehicle-expenses.module';
import { VerifyModule } from './verify/verify.module';
import { WalletsModule } from './wallets/wallets.module';

const webDistPath = join(process.cwd(), 'web', 'dist');
/** Set `DISABLE_SPA_STATIC=1` to rule out `@nestjs/serve-static` when debugging API-only 404s. */
const serveSpaFromApi =
  existsSync(webDistPath) && process.env.DISABLE_SPA_STATIC !== '1';
const spaStaticModule = serveSpaFromApi
  ? [
      ServeStaticModule.forRoot({
        rootPath: webDistPath,
        // Two `/api` patterns: different path-to-regexp versions accept `{*any}` vs `*param`.
        exclude: [
          '/api/{*any}',
          '/api/*path',
          '/docs/{*any}',
          '/uploads/{*any}',
        ],
      }),
    ]
  : [];

@Module({
  imports: [
    SecretsModule,
    ScheduleModule.forRoot(),
    // V19.x — In-process pub/sub used for the dispatch auto-completion
    // hook (OrdersService emits → DispatchService listens). Wildcard
    // matching is enabled so future modules can subscribe to namespaced
    // events without coordinating constants.
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 50,
      verboseMemoryLeak: false,
      ignoreErrors: false,
    }),
    ObservabilityModule,
    PrismaModule,
    PermissionsModule,
    AccountingModule,
    CashIntelligenceModule,
    CashMonitorModule,
    FinanceModule,
    // V20.6 — Phase 1: PeriodsModule is @Global() so its
    // FinancialPeriodsService is reachable from
    // DoubleEntryJournalService without an import cycle.
    PeriodsModule,
    OutstandingModule,
    // V20.4 — Phase 1 / 3 / 4 / 8 / 9 read-side architecture.
    DomainEventsModule,
    FinancialSnapshotsModule,
    DebtVisibilityModule,
    ReadModelsModule,
    FinancialTimelineModule,
    CollectionsIntelligenceModule,
    SalesDebtAnalyticsModule,
    AuthModule,
    SafariStreamModule,
    PresenceModule,
    CollectionsWorkflowModule,
    UsersModule,
    ReportsModule,
    PaymentMethodFeesModule,
    SystemModule,
    SystemConfigModule,
    SystemGuardianModule,
    SystemSettingsModule,
    CommissionsModule,
    DebtHoldsModule,
    ExpensesModule,
    ExportsModule,
    PayrollModule,
    FixedExpenseModule,
    OrdersModule,
    OwnerDashboardModule,
    PaymentsModule,
    BranchesModule,
    WalletsModule,
    AuditLogsModule,
    SubscriptionPlansModule,
    SubscribersModule,
    CallCenterModule,
    InvoiceAuditModule,
    LaundryPriceListModule,
    InventoryModule,
    PurchaseOrdersModule,
    QueueAdminModule,
    InsightsModule,
    ManagerCustodyModule,
    ManagerDocumentsModule,
    DriverOversightModule,
    PosModule,
    CustomersModule,
    DebtTransfersModule,
    DispatchModule,
    SerialsModule,
    ShiftsModule,
    AttendanceModule,
    LeavesModule,
    LoansModule,
    VehicleExpensesModule,
    VerifyModule,
    FeedbackModule,
    HealthModule,
    // /uploads is mounted in main.ts (express.static only) to avoid
    // ServeStaticModule’s SPA index fallback for missing files.
    ...spaStaticModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    AuditLogsMiddleware,
    HttpDrainService,
    // V20.4 — Phase 5 wildcard listener that wires every
    // `finance.*` domain event into `FinancialSnapshotService`.
    // Lives in AppModule so the cross-module dependency stays
    // contained at the composition root.
    FinancialSnapshotListener,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    const pre = [requestIdMiddleware, requestContextMiddleware];
    if (process.env.IP_REPUTATION_ENABLED === 'true') {
      pre.push(ipReputationMiddleware);
    }
    consumer
      .apply(...pre, OperatingHoursMiddleware, AuditLogsMiddleware)
      .forRoutes('*');
  }
}
