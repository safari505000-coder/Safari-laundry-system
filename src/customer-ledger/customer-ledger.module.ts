import { Module } from '@nestjs/common';
import { GeneralLedgerModule } from '../general-ledger/general-ledger.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomerLedgerService } from './customer-ledger.service';
import { PrepaidAutoReconcileCronService } from './prepaid-auto-reconcile.cron';

@Module({
  imports: [PrismaModule, GeneralLedgerModule, InventoryModule],
  providers: [CustomerLedgerService, PrepaidAutoReconcileCronService],
  exports: [CustomerLedgerService],
})
export class CustomerLedgerModule {}
