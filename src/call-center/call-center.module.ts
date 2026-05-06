import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CustomerLedgerModule } from '../customer-ledger/customer-ledger.module';
import { CustomerNotificationsModule } from '../customer-notifications/customer-notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { FinanceModule } from '../finance/finance.module';
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
    PaymentsModule,
    OrdersModule,
    CustomerNotificationsModule,
  ],
  controllers: [
    CallCenterController,
    PublicStatementController,
  ],
  providers: [CallCenterService, DailyCollectionsReconciliationCronService],
})
export class CallCenterModule {}
