import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommissionsModule } from '../commissions/commissions.module';
import { DebtHoldsModule } from '../debt-holds/debt-holds.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

// V19.19 — LoansModule is NO LONGER imported here. Loan deduction is a
// standalone OWNER / GM action via POST /api/loans/:id/deduct to
// prevent double-deducting the same instalment when payroll is re-run.
@Module({
  imports: [PrismaModule, AuthModule, CommissionsModule, DebtHoldsModule],
  controllers: [PayrollController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
