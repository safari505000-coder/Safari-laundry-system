import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingController } from './accounting.controller';
import { AccountingReconciliationService } from './accounting-reconciliation.service';

@Module({
  imports: [PrismaModule],
  controllers: [AccountingController],
  providers: [AccountingReconciliationService],
  // PrismaService is consumed by the controller's branch-clamp helper
  // (V19.33 — Branch Manager Dashboard scope enforcement).
  exports: [AccountingReconciliationService],
})
export class AccountingModule {}
