# V21 Phase 4 — Performance Validation

> Quantifies the event platform's runtime cost and the
> Phase 4-introduced overhead.

---

## 1 — Phase 4 runtime cost

### 1.1 Backend overhead

| Component | Overhead per event | Where measured |
|-----------|--------------------|----------------|
| `FinancialEventBus.publish` | 1× SHA-256 hash + 1× Prisma INSERT (UNIQUE-protected) + 1× `EventEmitter2.emit` | bus source |
| `FinancialEventDispatcher.tick` | 1× Prisma SELECT (LIMIT batch) + N× adapter.publish (bounded by `maxConcurrent=8`) + N× UPDATE deliveredAt | dispatcher source |
| `FinancialRealtimeGateway.onFinancialEvent` | 1× channel match (≤ 7 channels) + N× `Subject.next` (one per matched channel) | gateway source |

### 1.2 Frontend overhead per SSE event

  * 1× JSON parse of the envelope.
  * 1-3× `invalidateFinancial(prefix)` (synchronous map
    update; no network).
  * 1× `setState({ lastEventAt })` (React batched).
  * **Zero** payload-driven re-renders (canonical refetch
    decides what to re-render).

### 1.3 Per-subscriber idle cost

  * 1× HTTP keep-alive socket.
  * 1× `heartbeat` event every 15s (≈ 60 bytes).
  * No client-side polling — the connection is push-only.

---

## 2 — Phase 4 added cost

| Addition | Cost |
|----------|------|
| `v21-phase4-event-bus-integrity.spec.ts` | 7 unit tests, ~0.7s in CI |
| `v21-phase4-realtime-purity.test.ts` | 5 unit tests, ~0.13s in CI |
| Backend bundle delta | 0 (test files are excluded from `nest build`) |
| Frontend bundle delta | 0 (test files are excluded from Vite build by `tsconfig.app.json`) |
| Runtime memory delta | 0 (no production code added) |

---

## 3 — Headline budget vs measurement

| Mission target | Existing measurement | Margin |
|----------------|----------------------|--------|
| 500+ concurrent operators | 500 subscribers passing perf-stress test | At target |
| 30K+ events/minute | 1,000 dispatch in < 2s (≈ 30K/min) | At target on in-memory adapter |
| Bounded cache growth | TTL + LRU bounds (V20.8) | Bounded |
| Memory leak resistance | Subscriber count decrements correctly under stress | Verified |

---

## 4 — Production scaling notes

The throughput numbers above are measured on the **in-memory**
adapter. Production throughput will be dominated by the broker
client latency:

  * **Kafka** — `kafkajs` producer with `acks=-1` typically
    achieves p95 ≈ 5-15 ms per send to a healthy 3-broker
    cluster. With `maxConcurrent=8` that's ≈ 530-1,600
    messages/sec per dispatcher process — comfortably above
    the 30K/min target.
  * **RabbitMQ** — `amqplib` publisher confirms typically
    p95 ≈ 10-30 ms. Slightly tighter; consider
    `maxConcurrent=16` if needed (still below the Phase 4
    lock-in ceiling of 32).
  * **Redis Streams** — `XADD` is sub-millisecond; bounded
    by network round-trip. Easily exceeds target.

Per-customer ordering is preserved at the broker level via
`customerId` partition key (Kafka), routing key (Rabbit),
or stream key (Redis).

---

## 5 — Test suite runtime

| Suite | Phase 3 baseline | Phase 4 | Delta |
|-------|------------------|---------|-------|
| Frontend Vitest | 154 / 154, 6.09s | + 5 new tests = 159 | ≤ +0.2s |
| Backend Jest | 723 / 745, 7.57s | + 7 new tests in domain-events suite | flat (absorbed into existing 7.5s) |
| `npm run build` (frontend) | 1.27s | 1.27s | flat |
| `nest build` (backend) | 19s | 19s | flat |
| `madge --circular` | clean | clean | flat |

---

## 6 — Verdict

**Performance-neutral.** Phase 4 added 12 unit tests and 0
production code; it does not change runtime cost. Existing
stress harness shows the platform meets or exceeds the
mission's 500-operator / 30K-events-per-minute targets on the
in-memory adapter. Production capacity will be dominated by
broker latency; the bounded dispatcher concurrency keeps
client load predictable.
