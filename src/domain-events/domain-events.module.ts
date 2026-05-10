import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InMemoryEventBusAdapter } from './adapters/in-memory-event-bus.adapter';
import { FinancialDomainEventPublisher } from './financial-domain-event.publisher';
import { FinancialEventBus } from './financial-event-bus.service';
import { FinancialEventDispatcher } from './financial-event-dispatcher.service';
import { FinancialRealtimeGateway } from './realtime/financial-realtime.gateway';
import { FinancialRealtimeController } from './realtime/financial-realtime.controller';
import { RealtimeMetricsService } from './observability/realtime-metrics.service';
import { RealtimeMetricsController } from './observability/realtime-metrics.controller';

/**
 * V20.4 — Phase 5 / V20.6 — Phase 4 / V20.9 — Phase 1 domain-event
 * registry.
 *
 * `EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' })`
 * is already wired in `AppModule`, so this module registers the
 * typed publisher, the V20.6 durable bus AND the V20.9 dispatcher
 * + bus adapter. Listeners (e.g. {@link FinancialSnapshotListener})
 * live in their owning feature modules so the dependency direction
 * is feature → publisher (not publisher → every feature).
 *
 * `@Global()` so any service can inject any of these symbols
 * without explicit module imports.
 *
 * V20.9 default adapter is in-process / in-memory. To switch to
 * Kafka / RabbitMQ / Redis Streams in production: register a
 * different `EventBusAdapter` provider under the `EVENT_BUS_ADAPTER`
 * token.
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [FinancialRealtimeController, RealtimeMetricsController],
  providers: [
    FinancialDomainEventPublisher,
    FinancialEventBus,
    InMemoryEventBusAdapter,
    FinancialEventDispatcher,
    FinancialRealtimeGateway,
    RealtimeMetricsService,
  ],
  exports: [
    FinancialDomainEventPublisher,
    FinancialEventBus,
    InMemoryEventBusAdapter,
    FinancialEventDispatcher,
    FinancialRealtimeGateway,
    RealtimeMetricsService,
  ],
})
export class DomainEventsModule {}
