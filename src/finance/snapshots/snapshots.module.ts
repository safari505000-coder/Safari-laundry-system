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
 * V20.4 — Phase 1 read-side projection module.
 *
 * Owns the `FinancialSnapshot` table — its repository, projector,
 * and cron reconciler. Other modules (`DebtVisibilityService`,
 * domain-event listeners) inject {@link FinancialSnapshotService}
 * directly; the repository is intentionally not exported so
 * write paths stay consolidated in this module.
 *
 * V20.5 — Phase 7 additionally registers the AgingService and
 * RiskScoringService dependencies so the projector materialises
 * the new aging/risk/collections columns. Both services are
 * read-only and depend only on PrismaService, so registering
 * them locally avoids a circular FinanceModule import.
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
