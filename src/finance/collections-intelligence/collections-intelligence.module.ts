import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { FinancialSnapshotsModule } from '../snapshots/snapshots.module';
import { CollectionsIntelligenceService } from './collections-intelligence.service';

/**
 * وحدة استخبارات التحصيل — حساب درجات الأولوية والمخاطر للعملاء
 * V20.4 Phase 9 collections intelligence module.
 * Pure read: consumes FinancialSnapshot + ledger/order primaries.
 * Exported for Collections page and call-center dashboards.
 */
@Module({
  imports: [PrismaModule, FinancialSnapshotsModule],
  providers: [CollectionsIntelligenceService],
  exports: [CollectionsIntelligenceService],
})
export class CollectionsIntelligenceModule {}
