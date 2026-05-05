import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { DiscordAlertsModule } from '../common/services/discord-alerts.module';
import { ControllerMetricsInterceptor } from './controller-metrics.interceptor';
import { MetricsService } from './metrics.service';
import { QueueIntegrityService } from './queue-integrity.service';
import { QueueMetricsCollector } from './queue-metrics.collector';
import { SilenceBreakerService } from './silence-breaker.service';
import { SystemInvariantsService } from './system-invariants.service';
import { TimeSkewService } from './time-skew.service';
import { RevenueMetricsCollector } from './revenue-metrics.collector';

@Global()
@Module({
  imports: [DiscordAlertsModule, PrismaModule],
  providers: [
    MetricsService,
    QueueMetricsCollector,
    QueueIntegrityService,
    SilenceBreakerService,
    SystemInvariantsService,
    TimeSkewService,
    RevenueMetricsCollector,
    {
      provide: APP_INTERCEPTOR,
      useClass: ControllerMetricsInterceptor,
    },
  ],
  exports: [MetricsService],
})
export class ObservabilityModule {}
