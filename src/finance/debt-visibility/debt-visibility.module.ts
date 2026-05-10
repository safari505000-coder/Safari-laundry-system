import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { GeneralLedgerModule } from '../../general-ledger/general-ledger.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { FinancialSnapshotsModule } from '../snapshots/snapshots.module';
import { DebtVisibilityController } from './debt-visibility.controller';
import { DebtVisibilityService } from './debt-visibility.service';

/**
 * V20.4 — Phase 3 / Phase 16 visibility façade module.
 *
 * The single approved upstream for any operational read of
 * customer debt. Exports the service so other feature modules
 * (Subscribers, Outstanding, Customer 360, finance dashboards)
 * can inject it without re-importing the snapshot internals.
 */
@Module({
  imports: [
    // AuthModule imports FinanceModule → … → OrdersModule → DebtVisibilityModule.
    // Defer AuthModule resolution so Nest never sees `undefined` at imports[0].
    forwardRef(() => AuthModule),
    PrismaModule,
    GeneralLedgerModule,
    FinancialSnapshotsModule,
  ],
  controllers: [DebtVisibilityController],
  providers: [DebtVisibilityService],
  exports: [DebtVisibilityService],
})
export class DebtVisibilityModule {}
