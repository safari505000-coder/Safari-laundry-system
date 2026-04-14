import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { AuthModule } from './auth/auth.module';
import { BranchesModule } from './branches/branches.module';
import { CallCenterModule } from './call-center/call-center.module';
import { FinanceModule } from './finance/finance.module';
import { LaundryPriceListModule } from './laundry-price-list/laundry-price-list.module';
import { OrdersModule } from './orders/orders.module';
import { PermissionsModule } from './permissions/permissions.module';
import { PosModule } from './pos/pos.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { SubscriptionPlansModule } from './subscription-plans/subscription-plans.module';
import { SubscribersModule } from './subscribers/subscribers.module';
import { UsersModule } from './users/users.module';
import { WalletsModule } from './wallets/wallets.module';

const webDistPath = join(process.cwd(), 'web', 'dist');
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
    OrdersModule,
    BranchesModule,
    WalletsModule,
    PermissionsModule,
    AuditLogsModule,
    SubscriptionPlansModule,
    SubscribersModule,
    CallCenterModule,
    LaundryPriceListModule,
    PosModule,
    ...spaStaticModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
