# V21 Phase 4 — Realtime Infrastructure & Event Platform Forensic Audit

> Read-only audit of the existing event platform + realtime
> gateway + frontend canonical-purity boundary. Every finding
> cites concrete files and concrete behaviour. Findings are
> classified into **OBSERVED_HEALTHY**, **WIRE_NOW**,
> **DESIGN_AND_BUILD_V22**, and **DEPLOY_AT_SCALE**.

---

## 0 — Headline finding

**Safari ERP already has a production-grade event platform
end-to-end** (V20.6 + V20.9 work). The only structural gap is
that the **frontend realtime hook is built, tested, and
exported but consumed by ZERO components** — exactly the same
unwired-infrastructure pattern Phase 3 closed for the command
palette.

Phase 4 therefore focuses on:

  1. **Tree-wide architectural lock-ins** preventing future
     regressions of the canonical-purity invariant.
  2. **Frozen V22 wiring spec** for adopting the SSE feed on
     the right per-page surfaces.
  3. **Frozen deployment guide** for Kafka/RabbitMQ/Redis
     Streams adapter rollout (the 3 stubs are production-ready
     except for the broker client wiring).

---

## 1 — Domain-events layer

| Component | File | Status | Notes |
|-----------|------|--------|-------|
| Typed event surface | `src/domain-events/financial-domain-event.types.ts` | ✅ OBSERVED_HEALTHY | 19 named events, single `CustomerScopedPayload` shape, naming convention `noun.past-tense` enforces wildcard subscribers |
| Domain event publisher (V20.4) | `src/domain-events/financial-domain-event.publisher.ts` | ✅ OBSERVED_HEALTHY | Backwards-compat surface; both it and the bus use the same `EventEmitter2` so existing listeners still fire |
| Durable event bus (V20.6) | `src/domain-events/financial-event-bus.service.ts` | ✅ OBSERVED_HEALTHY | Append-only `FinancialEventOutbox`, deterministic SHA-256 eventId, idempotent producer + consumer, never throws upward |
| Event dispatcher (V20.9) | `src/domain-events/financial-event-dispatcher.service.ts` | ✅ OBSERVED_HEALTHY | Bounded concurrency (8), max 16 attempts, exponential backoff 250ms base, DLQ on overflow, replay tooling, ordered per customer |
| Bus adapter contract (V20.9) | `src/domain-events/adapters/event-bus-adapter.ts` | ✅ OBSERVED_HEALTHY | 3-method interface: `publish` / `healthCheck` / optional `shutdown` |
| In-memory adapter | `src/domain-events/adapters/in-memory-event-bus.adapter.ts` | ✅ OBSERVED_HEALTHY | Default; ring-buffer test harness |
| Kafka adapter (stub) | `src/domain-events/adapters/kafka-event-bus.adapter.ts` | DEPLOY_AT_SCALE | Throws on `publish` until wired; `kafkajs` recommended client; topic = `safari.financial-events.<eventName>`, partition key = `customerId` |
| RabbitMQ adapter (stub) | `src/domain-events/adapters/rabbitmq-event-bus.adapter.ts` | DEPLOY_AT_SCALE | Same pattern |
| Redis Streams adapter (stub) | `src/domain-events/adapters/redis-streams-event-bus.adapter.ts` | DEPLOY_AT_SCALE | Same pattern |

**Findings**:
  * The bus + dispatcher contract is already broker-agnostic.
    Switching to Kafka in production requires only registering
    the adapter under `EVENT_BUS_ADAPTER` provider token —
    zero change to producer code (verified in module wiring).
  * Determinism algorithm is locked: `evt_<sha256(name|customerId|correlationId|occurredAtSec).slice(0,32)>`.
    Same logical event published twice within the same second
    short-circuits at the unique index — idempotent at the
    publisher.
  * The bus NEVER throws upward (line 65 of the bus). A bus /
    DB outage logs at WARN and the caller's transaction commits
    unaffected. This is the canonical "financial truth survives
    realtime outages" guarantee.

---

## 2 — Realtime gateway

| Component | File | Status |
|-----------|------|--------|
| SSE gateway (V20.9 P2) | `src/domain-events/realtime/financial-realtime.gateway.ts` | ✅ OBSERVED_HEALTHY |
| SSE controller (V20.9 P2) | `src/domain-events/realtime/financial-realtime.controller.ts` | ✅ OBSERVED_HEALTHY |
| Channel + role contract | `src/domain-events/realtime/financial-realtime.types.ts` | ✅ OBSERVED_HEALTHY |
| 7 channels defined | `REALTIME_CHANNELS` | collections / customer360 / dashboards / fraud / reconciliation / risk / branch-accounting |

**Authorization**:
  * Hub-level `@Roles(...)` guard on the controller restricts
    the entire `/api/realtime/financial` namespace to the 6
    operator/manager roles.
  * Per-channel role gate runs again inside `subscribe()` —
    e.g. `fraud` only allows OWNER/GENERAL_MANAGER/MANAGER/CALL_CENTER_SUPERVISOR.
  * Customer scope + branch scope are query-string-applied
    server-side filters; the client cannot subscribe to a
    customer it isn't already authorised to view via the
    canonical API (canonical reads enforce row-level scope).

**Heartbeat + reconnect**:
  * `REALTIME_HEARTBEAT_MS = 15_000` — every 15s a
    `heartbeat` named event flows so reverse proxies don't
    close idle streams.
  * Each event carries an SSE `id:` line so browsers reconnect
    with `Last-Event-ID:` and the consumer dedups via the
    V20.6 `recordConsumed` table.

**Backpressure**:
  * One shared RxJS `Subject<>`; per-subscriber observable.
    Fan-out is O(1) regardless of subscriber count.

---

## 3 — Frontend realtime synchronization

| Component | File | Status | Notes |
|-----------|------|--------|-------|
| `SafariStreamProvider` | `web/src/contexts/safari-stream-context.tsx` | ✅ OBSERVED_HEALTHY | 45-second polling fetcher of the canonical snapshot endpoint — coarse-grained but always canonical |
| `useRealtimeFinancialFeed` (V20.9 P2) | `web/src/modules/finance/state/financial-realtime-feed.ts` | **WIRE_NOW gap** | Built + tested (4 unit tests passing) but **consumed by ZERO `.tsx` files**; only re-exported from `modules/finance/index.ts` |
| Canonical cache (`financialCache` + `invalidateFinancial`) | `web/src/modules/finance/state/financial-cache.ts` | ✅ OBSERVED_HEALTHY | The hook above only ever calls `invalidateFinancial(prefix)` — never `setQueryData(payload)`. Verified by `v20-9-realtime-feed.test.ts` test 2 |

**Canonical purity guarantee**:
  * `useRealtimeFinancialFeed` reads `envelope.eventName` to
    pick prefixes from `PREFIX_BY_EVENT` then calls
    `invalidateFinancial(prefix)`. It NEVER reads `envelope.payload.*Kd`.
  * The canonical refetch happens via `useFinancialQuery`
    after invalidation — so every displayed money value is
    server-canonical, never realtime-payload-derived.
  * Phase 4 adds an architectural-shape lock-in
    (`v21-phase4-realtime-purity.test.ts`) that asserts at
    the file-tree level that no `.tsx`/`.ts` file outside the
    realtime feed itself reads `envelope.payload.*Kd` or
    constructs `EventSource` directly.

**Replay-on-reconnect**:
  * Browser EventSource sends `Last-Event-ID:` automatically
    on reconnect.
  * Server gateway is stateless — it doesn't replay missed
    events; it relies on the client's next canonical refetch
    to re-synchronize.
  * That's the correct behaviour: a missed realtime event is
    a stale-cache prompt, not a missed financial entry.

---

## 4 — Observability layer

| Component | File | Status |
|-----------|------|--------|
| Snapshot service | `src/domain-events/observability/realtime-metrics.service.ts` | ✅ OBSERVED_HEALTHY |
| HTTP controller | `src/domain-events/observability/realtime-metrics.controller.ts` | ✅ OBSERVED_HEALTHY |
| Snapshot test | `src/domain-events/observability/v20-9-realtime-metrics.spec.ts` | ✅ OBSERVED_HEALTHY |

**Captured metrics**:
  * Bus adapter id
  * Dispatcher: dispatched / failed / dead-letter / skipped /
    last-tick-ago / last-tick-duration / failure-rate-percent
  * Realtime gateway: active-subscribers / published-to-fanout /
    dropped-no-channel / heartbeats-sent

**Built-in alert rules** (`evaluateAlerts`):
  * `V20_9_DISPATCHER_DLQ_GROWING` — ERROR at 1+, CRITICAL at 10+
  * `V20_9_DISPATCHER_FAILURE_RATE_HIGH` — ERROR at 25%, CRITICAL at 50%
  * `V20_9_DISPATCHER_STALE_TICK` — WARN if no tick in 5 minutes
  * `V20_9_REALTIME_NO_SUBSCRIBERS` — WARN if 100+ events with 0 subscribers
  * `V20_9_REALTIME_FAN_OUT_LAGGING` — WARN if 50+ events dropped no-channel

---

## 5 — Cross-cutting risks audit

| Risk class | Audit result |
|------------|--------------|
| Stale-event overwrite | ✅ Impossible — frontend hook only invalidates; never sets payload |
| Replay gap (missed event during reconnect) | ✅ Tolerated — next canonical refetch re-synchronizes; financial truth lives in the outbox + canonical projections |
| Duplicate broker delivery | ✅ Tolerated — consumer dedups via `FinancialEventDelivery` unique on `(eventId, consumerName)` |
| Fan-out bottleneck | ✅ O(1) shared `Subject<>` |
| Ordering weakness | ✅ Per-customer ordering preserved via outbox `publishedAt ASC` + Kafka partition key plan |
| Race conditions on outbox | ✅ Append-only INSERT; only `attempts` / `deliveredAt` / `lastError` mutate post-creation; bounded dispatcher concurrency |
| Dead-letter blind spot | ✅ DLQ rows stay in outbox (NEVER deleted); `evaluateAlerts` surfaces them |
| Missing observability hook | None — every counter has an alert rule |

---

## 6 — Phase 4 work plan

### 6.1 WIRE_NOW (Phase 4 deliverables)

  1. **Tree-wide canonical-purity guard** — assert no frontend
     `.tsx`/`.ts` file outside the approved realtime feed
     reads `envelope.payload.*Kd` or instantiates `EventSource`
     directly. Locks in the canonical-purity invariant at the
     architectural level.
  2. **Backend event-bus integrity guard** — assert:
       * `bus.emit('finance.*')` only happens inside the bus
         service file (no out-of-band emitters bypass the
         outbox).
       * The deterministic-id algorithm signature is intact.
       * Dispatcher constants meet floors (`maxAttempts >= 8`,
         `maxConcurrent <= 32`).
       * `FinancialEventOutbox` is never the target of
         `delete` / `deleteMany` outside the audit-cleanup
         scripts (none today).
  3. **Forensic audit + observability + replay-safety + perf
     deliverables** — this document set.

### 6.2 DESIGN_AND_BUILD_V22 (frozen specs in this phase)

  1. Wire `useRealtimeFinancialFeed` into:
       * Customer360 → channel `customer360`, scoped to the
         viewed customer.
       * Collections workspace → channel `collections`.
       * CC dashboard alerts → channel `fraud` + `risk`.
       * Reconciliation → channel `reconciliation`.
       * Branch accounting → channel `branch-accounting`,
         scoped to the operator's branch.
  2. Per-surface SSE lifecycle policy: connect on page mount,
     disconnect on unmount (the hook already handles this);
     idle-tab pause via `document.visibilityState` — V22.

### 6.3 DEPLOY_AT_SCALE (frozen rollout in this phase)

  1. **Kafka adapter wiring** — `kafkajs` producer; topic
     `safari.financial-events.<eventName>`; partition key
     `customerId`; `acks=-1`. Register under
     `EVENT_BUS_ADAPTER` provider token.
  2. **RabbitMQ adapter wiring** — `amqplib` publisher;
     exchange = `safari.financial-events`; routing key =
     event name; persistent + `mandatory=true`.
  3. **Redis Streams adapter wiring** — `ioredis` `XADD`
     to `safari:financial-events:<eventName>`; `MAXLEN ~`
     for capped retention.

See `docs/v21-phase4-rollout-guide.md` for the full
operational checklist.

---

## 7 — Audit verdict

The Safari ERP event platform is **structurally complete and
production-grade**. The single remaining gap is **frontend
adoption of the SSE feed**, which is intentionally V22 work
because it requires per-page lifecycle integration and
realistic load-testing. Phase 4 closes the architectural-shape
gap by adding tree-wide guards that lock in canonical purity
and event-bus integrity so future PRs cannot regress these
invariants without CI failure.
