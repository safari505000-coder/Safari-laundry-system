/**
 * وحدة العملاء — تجمع متحكم العملاء وخدمات العميل الأساسية و360 درجة.
 * Customers module — bundles the customers controller and core/360/blocking services.
 */
import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { DebtVisibilityModule } from '../finance/debt-visibility/debt-visibility.module';
import { CustomerBlockingService } from '../common/services/customer-blocking.service';
import { GeneralLedgerModule } from '../general-ledger/general-ledger.module';
import { CustomerNotificationsModule } from '../customer-notifications/customer-notifications.module';
import { CustomerCoreService } from './customer-core.service';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { Customer360Service } from './customer-360.service';
import { CustomerPickupScheduleService } from './customer-pickup-schedule.service';
import { CustomerPickupScheduleController } from './customer-pickup-schedule.controller';
import { CustomerPickupScheduleCron } from './customer-pickup-schedule.cron';
// HELD (unsafe card capture/charge): PaymentsModule was only imported to expose
// SavedCardsService to the pickup controller's saved-card endpoints, which are
// disabled until consent + idempotency land. Re-add when re-enabling them.
// import { PaymentsModule } from '../payments/payments.module';
import { CustomerLedgerModule } from '../customer-ledger/customer-ledger.module';

@Module({
  imports: [
    FinanceModule,
    GeneralLedgerModule,
    DebtVisibilityModule,
    CustomerNotificationsModule,
    CustomerLedgerModule,
  ],
  controllers: [CustomersController, CustomerPickupScheduleController],
  providers: [
    CustomersService,
    CustomerCoreService,
    Customer360Service,
    CustomerBlockingService,
    CustomerPickupScheduleService,
    CustomerPickupScheduleCron,
  ],
  exports: [CustomerPickupScheduleService],
})
export class CustomersModule {}
