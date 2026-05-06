import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DoubleEntryJournalService } from './double-entry-journal.service';
import { GeneralLedgerService } from './general-ledger.service';

@Module({
  imports: [PrismaModule],
  providers: [GeneralLedgerService, DoubleEntryJournalService],
  exports: [GeneralLedgerService, DoubleEntryJournalService],
})
export class GeneralLedgerModule {}
