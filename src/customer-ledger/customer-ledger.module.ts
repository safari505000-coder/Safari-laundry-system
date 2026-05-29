import { Module, forwardRef } from '@nestjs/common';
import { GeneralLedgerModule } from '../general-ledger/general-ledger.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersModule } from '../orders/orders.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomerLedgerService } from './customer-ledger.service';
import { DebtRegistrationService } from './debt-registration.service';
import { PrepaidAutoReconcileCronService } from './prepaid-auto-reconcile.cron';
import { WalletService } from './wallet.service';

/**
 * وحدة دفتر حسابات العملاء — تجمع خدمة الدفتر وجدولة التسوية التلقائية للمدفوع مسبقاً.
 * Customer-ledger module — bundles the ledger service and prepaid auto-reconcile cron.
 */
@Module({
  imports: [
    PrismaModule,
    GeneralLedgerModule,
    InventoryModule,
    forwardRef(() => OrdersModule),
  ],
  providers: [
    CustomerLedgerService,
    WalletService,
    DebtRegistrationService,
    PrepaidAutoReconcileCronService,
  ],
  exports: [CustomerLedgerService, WalletService],
})
export class CustomerLedgerModule {}
