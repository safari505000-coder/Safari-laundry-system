import { Module } from '@nestjs/common';
import { HealthModule } from '../health/health.module';
import { ObservabilityModule } from '../observability/observability.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OwnerDashboardController } from './owner-dashboard.controller';
import { OwnerDashboardRefreshScheduler } from './owner-dashboard-refresh.scheduler';
import { OwnerDashboardRefreshWorker } from './owner-dashboard-refresh.worker';
import { OwnerDashboardService } from './owner-dashboard.service';

@Module({
  imports: [HealthModule, ObservabilityModule, PrismaModule],
  controllers: [OwnerDashboardController],
  providers: [
    OwnerDashboardService,
    OwnerDashboardRefreshScheduler,
    OwnerDashboardRefreshWorker,
  ],
})
export class OwnerDashboardModule {}
