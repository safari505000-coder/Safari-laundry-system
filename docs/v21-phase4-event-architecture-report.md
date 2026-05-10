# V21 Phase 4 — Event Architecture Report

> Architectural overview of the Safari ERP event platform after
> the V21 Phase 4 integrity lock-ins. Captures the wire diagram,
> component responsibilities, broker-swap path, and the
> guarantees each layer carries.

---

## 1 — Wire diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  PRODUCER side — every financial mutation                            │
│  --------------------------------------------------------------------│
│  e.g. PaymentsService, SettlementService, WalletService              │
│       ⮕ DoubleEntryJournalService.appendBalanced(...)                │
│       ⮕ FinancialEventBus.publish(name, payload)                     │
│            ├─ INSERT FinancialEventOutbox(eventId=sha256(...), ...)  │
│            │     • UNIQUE(eventId) — duplicates short-circuit         │
│            └─ EventEmitter2.emit(name, envelope)  (in-process)       │
└─────────────────────────────────────────────────────────────────────┘
              │
              ▼  (synchronous in-process listeners)
┌─────────────────────────────────────────────────────────────────────┐
│  IN-PROCESS LISTENERS                                                │
│  --------------------------------------------------------------------│
│  • FinancialSnapshotListener     — refresh canonical snapshot        │
│  • FinancialRealtimeGateway      — fan-out to per-channel SSE        │
│  • SnapshotRealtimeRefresher     — V20.6 staleness invalidator       │
│  • UiConsistency                 — V20.x cross-projection guard      │
│                                                                       │
│  Listeners use FinancialEventBus.recordConsumed(eventId, consumer)   │
│  for idempotent processing (UNIQUE on (eventId, consumerName)).      │
└─────────────────────────────────────────────────────────────────────┘
              │
              ▼  (background — V20.9)
┌─────────────────────────────────────────────────────────────────────┐
│  DISPATCHER tick (FinancialEventDispatcher.tick(opts?))              │
│  --------------------------------------------------------------------│
│  SELECT * FROM FinancialEventOutbox                                  │
│   WHERE deliveredAt IS NULL AND attempts < maxAttempts               │
│   ORDER BY publishedAt ASC LIMIT batchSize                           │
│                                                                       │
│  for each row (bounded by maxConcurrent=8):                          │
│     adapter.publish(envelope)         ← KAFKA / RABBIT / REDIS       │
│     ↳ on ack:    UPDATE deliveredAt=NOW()                            │
│     ↳ on error:  UPDATE attempts++ , lastError=msg                   │
│                  if attempts >= maxAttempts ⇒ DLQ log + counter      │
│                                                                       │
│  Adapter contract = name + publish + healthCheck (+optional shutdown)│
└─────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  REALTIME GATEWAY (SSE)                                              │
│  --------------------------------------------------------------------│
│  GET /api/realtime/financial/:channel/stream?customer=…&branch=…    │
│       Authorization: Bearer <jwt>  OR  ?access_token=<jwt>           │
│                                                                       │
│  • Per-channel role gate (collector vs accountant vs supervisor)     │
│  • Per-customer + per-branch scoping                                 │
│  • Heartbeat every 15s (`heartbeat` named event)                     │
│  • Each event carries SSE id ⇒ Last-Event-ID auto-resume            │
│                                                                       │
│  Frontend: useRealtimeFinancialFeed({ channel, customerId, … })      │
│            ⮕ on `finance:event` ⇒ invalidateFinancial(prefixes)      │
│              (NEVER reads payload.*Kd; canonical refetch follows)    │
└─────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CONSUMER side — UI / async workers / 3rd-party integrations         │
│  --------------------------------------------------------------------│
│  • UI    ⇒ next useFinancialQuery(...) refetches canonical projection│
│  • Worker⇒ on receive: bus.recordConsumed → if processed do work     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2 — Component responsibilities

| Component | File | Responsibility | Guarantees |
|-----------|------|----------------|------------|
| FinancialEventBus | `src/domain-events/financial-event-bus.service.ts` | Authoritative event publisher | Append-only outbox, deterministic SHA-256 ids, idempotent producer (P2002 short-circuit), idempotent consumer surface (`recordConsumed`), never throws upward |
| FinancialDomainEventPublisher | `src/domain-events/financial-domain-event.publisher.ts` | V20.4 backwards-compat publisher | Emits the same `EventEmitter2` event the bus does — listeners are unchanged |
| FinancialEventDispatcher | `src/domain-events/financial-event-dispatcher.service.ts` | Background outbox→broker shipper | Bounded concurrency (8), bounded retries (16), exponential backoff (250ms base), DLQ on overflow, replay tooling, ordered per-customer |
| EventBusAdapter (interface) | `src/domain-events/adapters/event-bus-adapter.ts` | Broker contract | `name` / `publish(envelope)` / `healthCheck()` / `shutdown?()` |
| InMemoryEventBusAdapter | `src/domain-events/adapters/in-memory-event-bus.adapter.ts` | Default + test adapter | Ring-buffer test harness; simulates broker failures for tests |
| KafkaEventBusAdapter (stub) | `src/domain-events/adapters/kafka-event-bus.adapter.ts` | Production Kafka path | Topic = `safari.financial-events.<eventName>`, key = `customerId`, `acks=-1` |
| RabbitMQEventBusAdapter (stub) | `src/domain-events/adapters/rabbitmq-event-bus.adapter.ts` | Production RabbitMQ path | Exchange = `safari.financial-events`, RK = event name, persistent + mandatory |
| RedisStreamsEventBusAdapter (stub) | `src/domain-events/adapters/redis-streams-event-bus.adapter.ts` | Production Redis Streams path | `XADD safari:financial-events:<eventName>` with `MAXLEN ~` |
| FinancialRealtimeGateway | `src/domain-events/realtime/financial-realtime.gateway.ts` | SSE fan-out | O(1) shared `Subject<>`, per-channel role gate, heartbeats, customer + branch scoping |
| FinancialRealtimeController | `src/domain-events/realtime/financial-realtime.controller.ts` | HTTP entrypoint for SSE | Hub-level `@Roles` + per-channel `isRoleAllowed` (defence in depth) |
| RealtimeMetricsService | `src/domain-events/observability/realtime-metrics.service.ts` | Observability snapshot + alert evaluator | 5 alert rules covering DLQ growth / failure rate / stale tick / no subscribers / fan-out lag |
| useRealtimeFinancialFeed (frontend) | `web/src/modules/finance/state/financial-realtime-feed.ts` | SSE → canonical-cache invalidation | NEVER applies payload financials to UI; only invalidates and lets canonical refetch run |

---

## 3 — Phase 4 integrity lock-ins

| Lock-in | File | What it asserts |
|---------|------|------------------|
| Backend event-bus integrity (7 tests) | `src/domain-events/v21-phase4-event-bus-integrity.spec.ts` | Determinism algorithm signature; outbox-create-before-emit ordering; no out-of-band `emit('finance.…')`; dispatcher safety constants meet floors; outbox is append-only across the whole codebase; the 3 broker stubs keep contract; gateway role gate intact |
| Frontend realtime canonical purity (5 tests) | `web/src/modules/finance/state/v21-phase4-realtime-purity.test.ts` | No raw `EventSource` outside the approved hook + 2 documented operational consumers; no frontend file reads `envelope.payload.*Kd`; no frontend file outside the cache module calls `setQueryData`; the canonical hook still uses `invalidateFinancial`; the no-payload-application contract docstring is preserved |

These lock-ins are **architectural-shape** — they scan the whole
file tree on every CI run. A future PR that quietly adds a
direct `EventSource` to a financial component, or copies a
realtime payload into the cache, fails CI before reaching review.

---

## 4 — Broker swap path

The dispatcher reads the `EVENT_BUS_ADAPTER` provider token in
its constructor. To switch to Kafka in production:

```ts
// src/app.module.ts (or a deployment-specific module)
import { KafkaEventBusAdapter } from './domain-events/adapters/kafka-event-bus.adapter';

@Module({
  providers: [
    {
      provide: 'EVENT_BUS_ADAPTER',
      useFactory: () =>
        new KafkaEventBusAdapter({
          brokers: process.env.KAFKA_BROKERS!.split(','),
          clientId: 'safari-erp',
          topicPrefix: 'safari.financial-events',
        }),
    },
  ],
})
export class AppModule {}
```

That single registration is the entire change required at the
producer side. The 4 frontend channels + observability surface
work identically. See `docs/v21-phase4-rollout-guide.md`.

---

## 5 — What deliberately is NOT in the architecture

  * **Cross-region replication** — V22+ work; would require
    geo-aware partitioning and brokers that support
    multi-region.
  * **Schema registry** — today the typed event surface
    (`FinancialDomainEventName` + `FinancialDomainEventPayloadByName`)
    is the only schema. V22+ may add a registry for downstream
    consumers in other languages.
  * **Event sourcing CQRS** — the canonical projections are
    derived from the **transactional financial tables** + the
    immutable journal, not from the event stream. The event
    stream is a NOTIFICATION channel, not the source of truth.
    V22+ may add CQRS-shaped projections behind the event
    stream for read scaling, but only AFTER demonstrated need.
  * **At-most-once delivery** — would conflict with the
    canonical "missed events tolerated, canonical refetch
    re-synchronizes" model. We deliberately accept duplicates
    and rely on consumer dedup.
