import { Module } from '@nestjs/common';
import { GeneralLedgerModule } from '../general-ledger/general-ledger.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomerLedgerService } from './customer-ledger.service';

@Module({
  imports: [PrismaModule, GeneralLedgerModule, InventoryModule],
  providers: [CustomerLedgerService],
  exports: [CustomerLedgerService],
})
export class CustomerLedgerModule {}
