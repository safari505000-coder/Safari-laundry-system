import { Global, Module } from '@nestjs/common';
import { WorkerDedupService } from './worker-dedup.service';
import { DiscordAlertService } from './discord-alert.service';
import { DiscordAlertWorker } from './discord-alert.worker';
import { IntegrationCircuitBreakerService } from './integration-circuit-breaker.service';

@Global()
@Module({
  providers: [
    DiscordAlertService,
    DiscordAlertWorker,
    IntegrationCircuitBreakerService,
    WorkerDedupService,
  ],
  exports: [DiscordAlertService, IntegrationCircuitBreakerService, WorkerDedupService],
})
export class DiscordAlertsModule {}
