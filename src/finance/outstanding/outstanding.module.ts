import { Module, forwardRef } from '@nestjs/common';
import { OrdersModule } from '../../orders/orders.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { OutstandingController } from './outstanding.controller';
import { OutstandingExportService } from './outstanding-export.service';
import { OutstandingService } from './outstanding.service';
import { OutstandingSnapshotCron } from './outstanding-snapshot.cron';

/**
 * V19.x — Outstanding-Payments / Accounts-Receivable module.
 *
 * Exports {@link OutstandingService} so the orders pipeline can call
 * `assertNotBlocked()` before issuing a new invoice (see
 * `OrdersService.createQuick / posCheckout / createPosPaymentBundleOrders /
 * createDirect`). `AuditLogsService` is provided globally by the
 * @Global() AuditLogsModule, no extra import needed here.
 */
@Module({
  imports: [PrismaModule, forwardRef(() => OrdersModule)],
  controllers: [OutstandingController],
  providers: [
    OutstandingService,
    OutstandingExportService,
    OutstandingSnapshotCron,
  ],
  exports: [OutstandingService],
})
export class OutstandingModule {}
