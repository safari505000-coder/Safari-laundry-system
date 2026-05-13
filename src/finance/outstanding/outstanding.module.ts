import { Module, forwardRef } from '@nestjs/common';
import { OrdersModule } from '../../orders/orders.module';
import { DebtVisibilityModule } from '../debt-visibility/debt-visibility.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { OutstandingController } from './outstanding.controller';
import { OutstandingExportService } from './outstanding-export.service';
import { OutstandingService } from './outstanding.service';
import { OutstandingSnapshotCron } from './outstanding-snapshot.cron';

/**
 * وحدة المدفوعات المعلقة / الحسابات المستحقة القبض — تُصدّر OutstandingService لحارس الطلبات
 * V19.x Outstanding-Payments / Accounts-Receivable module.
 * Exports OutstandingService so the orders pipeline can call assertNotBlocked() before
 * issuing a new invoice. AuditLogsService is provided globally by AuditLogsModule.
 */
@Module({
  imports: [PrismaModule, DebtVisibilityModule, forwardRef(() => OrdersModule)],
  controllers: [OutstandingController],
  providers: [
    OutstandingService,
    OutstandingExportService,
    OutstandingSnapshotCron,
  ],
  exports: [OutstandingService],
})
export class OutstandingModule {}
