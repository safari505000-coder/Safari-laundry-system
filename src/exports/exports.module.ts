import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { AuthModule } from '../auth/auth.module';
import { FinanceModule } from '../finance/finance.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PayrollModule } from '../payroll/payroll.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ReportsModule } from '../reports/reports.module';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ReportsModule,
    AttendanceModule,
    PayrollModule,
    FinanceModule,
    InventoryModule,
  ],
  controllers: [ExportsController],
  providers: [ExportsService],
  exports: [ExportsService],
})
export class ExportsModule {}
