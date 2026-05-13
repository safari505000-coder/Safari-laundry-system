import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BackfillAuditLockGuard } from './backfill-audit-lock.guard';
import { DoubleEntryJournalService } from './double-entry-journal.service';
import { FinancialTransactionProcessorService } from './financial-transaction-processor.service';
import { GeneralLedgerService } from './general-ledger.service';
import { JournalSourceService } from './journal-source.service';

@Module({
  imports: [PrismaModule],
  providers: [
    GeneralLedgerService,
    DoubleEntryJournalService,
    FinancialTransactionProcessorService,
    BackfillAuditLockGuard,
    JournalSourceService,
  ],
  exports: [
    GeneralLedgerService,
    DoubleEntryJournalService,
    FinancialTransactionProcessorService,
    BackfillAuditLockGuard,
    JournalSourceService,
  ],
})
export class GeneralLedgerModule {}
