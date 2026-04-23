import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DriverOversightController } from './driver-oversight.controller';
import { DriverOversightService } from './driver-oversight.service';

/**
 * V19.22.5 — Branch-Manager "Driver Oversight" island.
 *
 * Pure read-only surface that aggregates per-driver daily activity
 * (today's orders + cash, pending invoices, held cash, stale quick
 * invoices) into a single card list.
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [DriverOversightController],
  providers: [DriverOversightService],
  exports: [DriverOversightService],
})
export class DriverOversightModule {}
