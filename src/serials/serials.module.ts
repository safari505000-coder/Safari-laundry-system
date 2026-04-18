import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SerialCounterService } from './serial-counter.service';
import { SerialsController } from './serials.controller';
import { SerialsService } from './serials.service';

/**
 * Dastur §1 (V1.5) — Serial Management.
 *
 * Exports `SerialCounterService` so other modules (e.g. OrdersModule) can
 * stamp `Order.serialNumber` at creation time without reaching into the
 * Prisma client directly.
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [SerialsController],
  providers: [SerialsService, SerialCounterService],
  exports: [SerialCounterService],
})
export class SerialsModule {}
