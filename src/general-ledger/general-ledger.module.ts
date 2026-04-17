import { Module } from '@nestjs/common';
import { GeneralLedgerService } from './general-ledger.service';

@Module({
  providers: [GeneralLedgerService],
  exports: [GeneralLedgerService],
})
export class GeneralLedgerModule {}
