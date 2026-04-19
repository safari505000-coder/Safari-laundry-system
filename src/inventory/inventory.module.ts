import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { LowStockCronService } from './low-stock-cron.service';

/**
 * NOTE: We intentionally do NOT import `AuthModule` here.
 *
 * The controller's `@UseGuards(JwtAuthGuard, RolesGuard)` references
 * the guard classes directly and relies on the global registration
 * performed by `AppModule → AuthModule`. Re-importing `AuthModule`
 * here would create a cycle once `PaymentsModule` pulls us in:
 *
 *   AppModule → FinanceModule → PaymentsModule → InventoryModule
 *     → AuthModule → FinanceModule ↺
 *
 * Other leaf modules (PaymentsModule, OrdersModule) use the same
 * pattern without importing AuthModule locally.
 */
@Module({
  imports: [PrismaModule],
  controllers: [InventoryController],
  providers: [InventoryService, LowStockCronService],
  exports: [InventoryService, LowStockCronService],
})
export class InventoryModule {}
