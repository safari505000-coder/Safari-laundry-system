import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GeneralLedgerModule } from '../general-ledger/general-ledger.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditService } from '../common/audit/audit.service';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { FinanceExpensesSummaryController } from './finance-expenses-summary.controller';

@Module({
  imports: [PrismaModule, AuthModule, GeneralLedgerModule],
  controllers: [ExpensesController, FinanceExpensesSummaryController],
  providers: [ExpensesService, AuditService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
