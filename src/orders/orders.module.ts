import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CustomerLedgerModule } from '../customer-ledger/customer-ledger.module';
import { GeneralLedgerModule } from '../general-ledger/general-ledger.module';
import { CustomerNotificationsModule } from '../customer-notifications/customer-notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { SerialsModule } from '../serials/serials.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    AuthModule,
    CustomerLedgerModule,
    GeneralLedgerModule,
    PaymentsModule,
    CustomerNotificationsModule,
    SerialsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
