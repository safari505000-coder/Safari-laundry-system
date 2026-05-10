import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DebtVisibilityModule } from '../finance/debt-visibility/debt-visibility.module';
import { GeneralLedgerModule } from '../general-ledger/general-ledger.module';
import { OrdersModule } from '../orders/orders.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SubscribersController } from './subscribers.controller';
import { SubscribersService } from './subscribers.service';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    OrdersModule,
    GeneralLedgerModule,
    // V20.4 — Phase 16. Subscribers list now reads
    // `remainingDebtKd` through the canonical visibility
    // façade so it stays in lockstep with Outstanding /
    // Collections without recomputing the canonical helper.
    DebtVisibilityModule,
  ],
  controllers: [SubscribersController],
  providers: [SubscribersService],
})
export class SubscribersModule {}
