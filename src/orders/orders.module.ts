import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CustomerLedgerModule } from '../customer-ledger/customer-ledger.module';
import { GeneralLedgerModule } from '../general-ledger/general-ledger.module';
import { CustomerNotificationsModule } from '../customer-notifications/customer-notifications.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PaymentsModule } from '../payments/payments.module';
import { ExpoPushService } from '../public-api/expo-push.service';
import { SerialsModule } from '../serials/serials.module';
import { AuditService } from '../common/audit/audit.service';
import { CustomerBlockGuard } from '../common/guards/customer-block.guard';
import { CustomerBlockingService } from '../common/services/customer-blocking.service';
import { DebtVisibilityModule } from '../finance/debt-visibility/debt-visibility.module';
import { OutstandingModule } from '../finance/outstanding/outstanding.module';
import { DriverOrderDeliveryController } from './driver-order-delivery.controller';
import { OrdersController } from './orders.controller';
import { PublicInvoiceController } from './public-invoice.controller';
import { OrderDeliveryService } from './order-delivery.service';
import { OrdersService } from './orders.service';
import { StaleQuickOrdersCronService } from './stale-quick-orders.cron';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => CustomerLedgerModule),
    GeneralLedgerModule,
    forwardRef(() => PaymentsModule),
    CustomerNotificationsModule,
    SerialsModule,
    InventoryModule,
    DebtVisibilityModule,
    forwardRef(() => OutstandingModule),
  ],
  controllers: [
    OrdersController,
    PublicInvoiceController,
    DriverOrderDeliveryController,
  ],
  providers: [
    OrdersService,
    OrderDeliveryService,
    ExpoPushService,
    StaleQuickOrdersCronService,
    AuditService,
    CustomerBlockGuard,
    CustomerBlockingService,
  ],
  exports: [OrdersService, OrderDeliveryService],
})
export class OrdersModule {}
