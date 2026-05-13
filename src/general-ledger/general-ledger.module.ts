import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BackfillAuditLockGuard } from './backfill-audit-lock.guard';
import { DoubleEntryJournalService } from './double-entry-journal.service';
import { FinancialTransactionProcessorService } from './financial-transaction-processor.service';
import { GeneralLedgerService } from './general-ledger.service';
import { JournalSourceService } from './journal-source.service';

/**
 * وحدة الدفتر الأستاذ العام — تُصدِّر جميع خدمات اليومية المحاسبية.
 *
 * تجمع الوحدة:
 * - `GeneralLedgerService`: كتابة سجلات الدفتر القديم (V4).
 * - `DoubleEntryJournalService`: النواة المحاسبية — قيد مزدوج متوازن.
 * - `FinancialTransactionProcessorService`: معالج المعاملات عالي المستوى.
 * - `BackfillAuditLockGuard`: حارس سلامة البيانات عند التشغيل.
 * - `JournalSourceService`: قراءة الذمم من اليومية كمصدر رئيسي.
 *
 * General Ledger NestJS module — exports all accounting journal services.
 *
 * Bundles:
 * - `GeneralLedgerService`: legacy single-entry ledger writes (V4).
 * - `DoubleEntryJournalService`: accounting core — balanced double-entry.
 * - `FinancialTransactionProcessorService`: high-level transaction orchestrator.
 * - `BackfillAuditLockGuard`: data-integrity guard on application bootstrap.
 * - `JournalSourceService`: journal-as-source AR read layer.
 *
 * @since V20.1
 */
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
