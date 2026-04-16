import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BankDepositsController } from './bank-deposits.controller';
import { BankDepositsService } from './bank-deposits.service';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  imports: [PrismaModule],
  controllers: [FinanceController, BankDepositsController],
  providers: [FinanceService, BankDepositsService],
  exports: [FinanceService, BankDepositsService],
})
export class FinanceModule {}
