import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CustomerLedgerModule } from '../customer-ledger/customer-ledger.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CallCenterController } from './call-center.controller';
import { CallCenterService } from './call-center.service';
import { DailyCollectionsReconciliationCronService } from './daily-collections-reconciliation.cron';
import { PublicStatementController } from './public-statement.controller';

@Module({
  imports: [PrismaModule, AuthModule, CustomerLedgerModule, PaymentsModule],
  controllers: [CallCenterController, PublicStatementController],
  providers: [CallCenterService, DailyCollectionsReconciliationCronService],
})
export class CallCenterModule {}
