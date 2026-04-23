import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommissionsModule } from '../commissions/commissions.module';
import { DebtHoldsModule } from '../debt-holds/debt-holds.module';
import { LoansModule } from '../loans/loans.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

// V19.20 — LoansModule is RE-imported so the payroll transaction can
// book the scheduled monthly instalment against each ACTIVE loan via
// `LoansService.bookPayrollInstalmentsFor`. Unlike the V19.18 flow,
// which double-deducted on re-run, the V19.20 booking is guarded by
// `EmployeeLoan.lastDeductionYearMonth` so the same YYYY-MM can never
// be consumed twice. Manual ad-hoc deductions (V19.19) still flow
// through `POST /api/loans/:id/deduct` and stay orthogonal.
@Module({
  imports: [
    PrismaModule,
    AuthModule,
    CommissionsModule,
    DebtHoldsModule,
    LoansModule,
  ],
  controllers: [PayrollController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
