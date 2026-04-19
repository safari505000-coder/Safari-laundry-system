import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { FixedExpenseModule } from '../fixed-expenses/fixed-expense.module';
import { PaymentMethodFeesModule } from '../payment-method-fees/payment-method-fees.module';
import { PayrollModule } from '../payroll/payroll.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    ExpensesModule,
    PayrollModule,
    FixedExpenseModule,
    PaymentMethodFeesModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
