/**
 * وحدة مركز الاتصال — تضم متحكمات الخدمة والكشوفات العامة وبرج المراقبة وجدول التسوية اليومية.
 * Call-center module — bundles the main service, public-statement controller, control tower, and daily reconciliation cron.
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CustomerLedgerModule } from '../customer-ledger/customer-ledger.module';
import { CustomerNotificationsModule } from '../customer-notifications/customer-notifications.module';
import { PublicApiModule } from '../public-api/public-api.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { FinanceModule } from '../finance/finance.module';
import { DebtVisibilityModule } from '../finance/debt-visibility/debt-visibility.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CallCenterController } from './call-center.controller';
import { CallCenterService } from './call-center.service';
import { ControlTowerModule } from './control-tower/control-tower.module';
import { DailyCollectionsReconciliationCronService } from './daily-collections-reconciliation.cron';
import { PublicStatementController } from './public-statement.controller';

@Module({
  imports: [
    PrismaModule,
    ControlTowerModule,
    AuthModule,
    CustomerLedgerModule,
    FinanceModule,
    DebtVisibilityModule,
    PaymentsModule,
    OrdersModule,
    CustomerNotificationsModule,
    PublicApiModule,
  ],
  controllers: [
    CallCenterController,
    PublicStatementController,
  ],
  providers: [CallCenterService, DailyCollectionsReconciliationCronService],
})
export class CallCenterModule {}
