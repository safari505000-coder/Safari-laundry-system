import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommissionsModule } from '../commissions/commissions.module';
import { DebtHoldsModule } from '../debt-holds/debt-holds.module';
import { LoansModule } from '../loans/loans.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    forwardRef(() => LoansModule),
    CommissionsModule,
    DebtHoldsModule,
  ],
  controllers: [PayrollController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
