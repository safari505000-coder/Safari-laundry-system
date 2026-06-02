import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductionController } from './production.controller';
import { ProductionService } from './production.service';
import { WorkerTasksController } from './worker-tasks.controller';

/**
 * Production Worker Layer — activates the WORKER role as a real in-plant
 * garment-lifecycle function. Fully additive: no dependency on POS,
 * payments, or accounting modules. AuditLogsService is provided globally
 * by the @Global() AuditLogsModule.
 */
@Module({
  imports: [PrismaModule],
  controllers: [WorkerTasksController, ProductionController],
  providers: [ProductionService],
  exports: [ProductionService],
})
export class ProductionModule {}
