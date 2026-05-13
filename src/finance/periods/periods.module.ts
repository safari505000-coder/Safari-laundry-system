import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { FinancialPeriodsService } from './financial-periods.service';
import { FinancialPeriodsController } from './financial-periods.controller';

/**
 * وحدة الفترات المالية (عالمية) — تكسر دورة الاستيراد بين FinanceModule وGeneralLedgerModule
 * V20.6 Phase 1 @Global module owning FinancialPeriodsService so it
 * can be injected by `DoubleEntryJournalService` (in
 * `general-ledger`) without creating an import cycle through
 * `FinanceModule`.
 *
 * Why @Global:
 *   • The journal writer lives BELOW the finance layer in the
 *     module graph; without @Global it cannot reach a service
 *     that lives in `FinanceModule`.
 *   • Keeping the periods service in a tiny stand-alone module
 *     (only PrismaModule as a dependency) is the cleanest way to
 *     break the cycle without forwardRef gymnastics.
 *
 * Backwards-compatibility:
 *   • `FinanceModule` no longer declares `FinancialPeriodsService`
 *     as a provider/export — but every consumer still imports the
 *     service from its original path
 *     (`src/finance/periods/financial-periods.service.ts`), so all
 *     existing TypeScript imports continue to compile unchanged.
 *   • The HTTP surface (`/api/finance/periods/*`) is unchanged —
 *     the controller is registered here.
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [FinancialPeriodsController],
  providers: [FinancialPeriodsService],
  exports: [FinancialPeriodsService],
})
export class PeriodsModule {}
