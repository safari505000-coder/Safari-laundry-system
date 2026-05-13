import { Module } from '@nestjs/common';
import { GeneralLedgerModule } from '../../general-ledger/general-ledger.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AgingService } from '../aging/aging.service';
import { RiskScoringService } from '../risk/risk-scoring.service';
import { FinancialSnapshotCron } from './financial-snapshot.cron';
import { FinancialSnapshotRepository } from './financial-snapshot.repository';
import { FinancialSnapshotService } from './financial-snapshot.service';
import { SnapshotRealtimeRefresher } from './snapshot-realtime-refresher.service';

/**
 * وحدة اللقطات المالية — تمتلك جدول FinancialSnapshot والمشروع الحتمي
 * V20.4 Phase 1 read-side projection module.
 * Owns the FinancialSnapshot table: repository, projector (FinancialSnapshotService),
 * and cron reconciler. The repository is NOT exported to consolidate all write paths.
 * V20.5 Phase 7: additionally registers AgingService and RiskScoringService dependencies
 * so the projector materialises aging/risk/collections columns.
 */
@Module({
  imports: [PrismaModule, GeneralLedgerModule],
  providers: [
    FinancialSnapshotRepository,
    FinancialSnapshotService,
    FinancialSnapshotCron,
    AgingService,
    RiskScoringService,
    // V20.6 — Phase 5 realtime refresher (debounced + concurrency-capped).
    {
      provide: SnapshotRealtimeRefresher,
      useFactory: (svc: FinancialSnapshotService) =>
        new SnapshotRealtimeRefresher(svc),
      inject: [FinancialSnapshotService],
    },
  ],
  exports: [FinancialSnapshotService, SnapshotRealtimeRefresher],
})
export class FinancialSnapshotsModule {}
