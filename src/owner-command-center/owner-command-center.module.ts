import { Module } from '@nestjs/common';
import { HealthModule } from '../health/health.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OwnerCommandCenterController } from './owner-command-center.controller';
import { OwnerCommandCenterService } from './owner-command-center.service';

/**
 * V10 HARDENING — owner system-health + command-center endpoints.
 * Read-only; reuses ReadinessService and Prisma. No existing module modified.
 */
@Module({
  imports: [PrismaModule, HealthModule],
  controllers: [OwnerCommandCenterController],
  providers: [OwnerCommandCenterService],
  exports: [OwnerCommandCenterService],
})
export class OwnerCommandCenterModule {}
