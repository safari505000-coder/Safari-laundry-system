import { Module } from '@nestjs/common';
import { GeneralLedgerModule } from '../general-ledger/general-ledger.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomerLedgerService } from './customer-ledger.service';

@Module({
  imports: [PrismaModule, GeneralLedgerModule],
  providers: [CustomerLedgerService],
  exports: [CustomerLedgerService],
})
export class CustomerLedgerModule {}
