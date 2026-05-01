import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SerialCounterService } from './serial-counter.service';
import { SerialGapService } from './serial-gap.service';
import { SerialsController } from './serials.controller';
import { SerialsService } from './serials.service';

/**
 * Dastur §1 (V1.5) — Serial Management + §3.8 gap-monitor.
 *
 * Exports `SerialCounterService` so other modules (e.g. OrdersModule) can
 * stamp `Order.serialNumber` at creation time without reaching into the
 * Prisma client directly. `SerialGapService` stays internal: it surfaces
 * through the OWNER-only endpoints on `SerialsController`.
 */
@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule)],
  controllers: [SerialsController],
  providers: [SerialsService, SerialCounterService, SerialGapService],
  exports: [SerialCounterService],
})
export class SerialsModule {}
