import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GeneralLedgerModule } from '../general-ledger/general-ledger.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

@Module({
  imports: [PrismaModule, AuthModule, GeneralLedgerModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
