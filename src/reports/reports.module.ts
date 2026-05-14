/**
 * وحدة التقارير — تجمع خدمة التقارير ومتحكمها مع خدمات المصاريف والرواتب والرسوم.
 * Reports module — bundles the reports service and controller with expenses, payroll, and fees modules.
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { FixedExpenseModule } from '../fixed-expenses/fixed-expense.module';
import { PaymentMethodFeesModule } from '../payment-method-fees/payment-method-fees.module';
import { PayrollModule } from '../payroll/payroll.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditService } from '../common/audit/audit.service';
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
  providers: [ReportsService, AuditService],
  exports: [ReportsService],
})
export class ReportsModule {}
