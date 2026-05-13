import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { GeneralLedgerModule } from '../../general-ledger/general-ledger.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { FinancialSnapshotsModule } from '../snapshots/snapshots.module';
import { DebtVisibilityController } from './debt-visibility.controller';
import { DebtVisibilityService } from './debt-visibility.service';

/**
 * وحدة رؤية الديون — الواجهة الكانونية الوحيدة المعتمدة لقراءة ديون العملاء
 * V20.4 Phase 3/16 debt visibility façade module.
 * Single approved upstream for any operational customer debt read.
 * Exports DebtVisibilityService for Subscribers, Outstanding, Customer 360, and dashboards.
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
