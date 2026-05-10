import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { FinancialSnapshotsModule } from '../snapshots/snapshots.module';
import { CollectionsIntelligenceService } from './collections-intelligence.service';

/**
 * V20.4 — Phase 9 collections intelligence module.
 *
 * Pure read; consumes `FinancialSnapshot` + ledger / order
 * primaries. Exported so the Collections page / call-center
 * dashboards can fan out priority computations across a
 * paginated set of customer ids.
 */
@Module({
  imports: [PrismaModule, FinancialSnapshotsModule],
  providers: [CollectionsIntelligenceService],
  exports: [CollectionsIntelligenceService],
})
export class CollectionsIntelligenceModule {}
