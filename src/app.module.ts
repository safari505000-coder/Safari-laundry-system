import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { AuthModule } from './auth/auth.module';
import { BranchesModule } from './branches/branches.module';
import { CallCenterModule } from './call-center/call-center.module';
import { OperatingHoursMiddleware } from './common/middleware/operating-hours.middleware';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { CustomersModule } from './customers/customers.module';
import { ExpensesModule } from './expenses/expenses.module';
import { FixedExpenseModule } from './fixed-expenses/fixed-expense.module';
import { PayrollModule } from './payroll/payroll.module';
import { FinanceModule } from './finance/finance.module';
import { LaundryPriceListModule } from './laundry-price-list/laundry-price-list.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { PermissionsModule } from './permissions/permissions.module';
import { PosModule } from './pos/pos.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { SystemModule } from './system/system.module';
import { SubscriptionPlansModule } from './subscription-plans/subscription-plans.module';
import { SubscribersModule } from './subscribers/subscribers.module';
import { UsersModule } from './users/users.module';
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
    PrismaModule,
    FinanceModule,
    AuthModule,
    UsersModule,
    ReportsModule,
    SystemModule,
    ExpensesModule,
    PayrollModule,
    FixedExpenseModule,
    OrdersModule,
    PaymentsModule,
    BranchesModule,
    WalletsModule,
    PermissionsModule,
    AuditLogsModule,
    SubscriptionPlansModule,
    SubscribersModule,
    CallCenterModule,
    LaundryPriceListModule,
    PosModule,
    CustomersModule,
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
