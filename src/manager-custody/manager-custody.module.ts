import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FinanceModule } from '../finance/finance.module';
import { GeneralLedgerModule } from '../general-ledger/general-ledger.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CashFlowAliasesController } from './cash-flow-aliases.controller';
import { ManagerCustodyController } from './manager-custody.controller';
import { ManagerCustodyService } from './manager-custody.service';

/**
 * Dastur §3 — Manager Accountability.
 * Owns the ManagerCashCustody lifecycle (driver → manager → accountant).
 *
 * Imports FinanceModule so approveReceiptFromDriver can delegate to the
 * canonical CashService.confirmHandover pipeline (A3.D5 — unify dual
 * handover paths).
 */
@Module({
  imports: [PrismaModule, AuthModule, GeneralLedgerModule, FinanceModule],
  controllers: [ManagerCustodyController, CashFlowAliasesController],
  providers: [ManagerCustodyService],
  exports: [ManagerCustodyService],
})
export class ManagerCustodyModule {}
