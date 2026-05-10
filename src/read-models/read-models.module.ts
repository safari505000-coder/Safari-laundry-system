import { Global, Module } from '@nestjs/common';
import { DebtVisibilityModule } from '../finance/debt-visibility/debt-visibility.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CollectionsReadModel } from './collections-read-model/collections-read-model.service';
import { FinanceKpiReadModel } from './finance-kpi-read-model/finance-kpi-read-model.service';
import { FinanceKpiSnapshotCron } from './finance-kpi-read-model/finance-kpi-snapshot.cron';
import { OutstandingReadModel } from './outstanding-read-model/outstanding-read-model.service';
import { SubscriberReadModel } from './subscriber-read-model/subscriber-read-model.service';

/**
 * V20.4 — Phase 2 read-side projection registry.
 *
 * `@Global()` so consumers don't have to enumerate the
 * specific read-model they want; one import in AppModule
 * makes every projection available everywhere.
 */
@Global()
@Module({
  imports: [PrismaModule, DebtVisibilityModule],
  providers: [
    CollectionsReadModel,
    SubscriberReadModel,
    OutstandingReadModel,
    FinanceKpiReadModel,
    FinanceKpiSnapshotCron,
  ],
  exports: [
    CollectionsReadModel,
    SubscriberReadModel,
    OutstandingReadModel,
    FinanceKpiReadModel,
  ],
})
export class ReadModelsModule {}
