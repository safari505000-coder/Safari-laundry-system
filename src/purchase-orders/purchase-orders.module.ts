import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';

/**
 * Stage-F Cosmetic — Purchase Order workflow.
 *
 * Depends on InventoryService to commit stock movements on receipt.
 * Guards (JwtAuthGuard, RolesGuard) are global via AuthModule so no
 * local import is needed here — mirrors InventoryModule's comment.
 */
@Module({
  imports: [PrismaModule, InventoryModule],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService],
  exports: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
