import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AttendanceModule } from './attendance/attendance.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { AuthModule } from './auth/auth.module';
import { BranchesModule } from './branches/branches.module';
import { CallCenterModule } from './call-center/call-center.module';
import { OperatingHoursMiddleware } from './common/middleware/operating-hours.middleware';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { CustomersModule } from './customers/customers.module';
import { DebtTransfersModule } from './debt-transfers/debt-transfers.module';
import { ExpensesModule } from './expenses/expenses.module';
import { ExportsModule } from './exports/exports.module';
import { FixedExpenseModule } from './fixed-expenses/fixed-expense.module';
import { PayrollModule } from './payroll/payroll.module';
import { FinanceModule } from './finance/finance.module';
import { HealthModule } from './health/health.module';
import { InsightsModule } from './insights/insights.module';
import { InventoryModule } from './inventory/inventory.module';
import { LaundryPriceListModule } from './laundry-price-list/laundry-price-list.module';
import { LeavesModule } from './leaves/leaves.module';
import { LoansModule } from './loans/loans.module';
import { ManagerCustodyModule } from './manager-custody/manager-custody.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentMethodFeesModule } from './payment-method-fees/payment-method-fees.module';
import { PaymentsModule } from './payments/payments.module';
import { PermissionsModule } from './permissions/permissions.module';
import { PosModule } from './pos/pos.module';
import { PrismaModule } from './prisma/prisma.module';
import { SafariStreamModule } from './safari-stream/safari-stream.module';
import { ReportsModule } from './reports/reports.module';
import { SerialsModule } from './serials/serials.module';
import { ShiftsModule } from './shifts/shifts.module';
import { SystemModule } from './system/system.module';
import { SubscriptionPlansModule } from './subscription-plans/subscription-plans.module';
import { SubscribersModule } from './subscribers/subscribers.module';
import { UsersModule } from './users/users.module';
import { VerifyModule } from './verify/verify.module';
import { WalletsModule } from './wallets/wallets.module';

const webDistPath = join(process.cwd(), 'web', 'dist');
const uploadsPath = join(process.cwd(), 'uploads');
const spaStaticModule = existsSync(webDistPath)
  ? [
      ServeStaticModule.forRoot({
        rootPath: webDistPath,
        exclude: ['/api/{*any}', '/docs/{*any}'],
      }),
    ]
  : [];

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    PermissionsModule,
    FinanceModule,
    AuthModule,
    SafariStreamModule,
    UsersModule,
    ReportsModule,
    PaymentMethodFeesModule,
    SystemModule,
    ExpensesModule,
    ExportsModule,
    PayrollModule,
    FixedExpenseModule,
    OrdersModule,
    PaymentsModule,
    BranchesModule,
    WalletsModule,
    AuditLogsModule,
    SubscriptionPlansModule,
    SubscribersModule,
    CallCenterModule,
    LaundryPriceListModule,
    InventoryModule,
    InsightsModule,
    ManagerCustodyModule,
    PosModule,
    CustomersModule,
    DebtTransfersModule,
    SerialsModule,
    ShiftsModule,
    AttendanceModule,
    LeavesModule,
    LoansModule,
    VerifyModule,
    HealthModule,
    ServeStaticModule.forRoot({
      rootPath: uploadsPath,
      serveRoot: '/uploads',
      serveStaticOptions: { index: false, fallthrough: true },
    }),
    ...spaStaticModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(requestIdMiddleware, OperatingHoursMiddleware).forRoutes('*');
  }
}
