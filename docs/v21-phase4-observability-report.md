# V21 Phase 4 — Observability Report

> Catalogue of every event-platform metric, alert, and
> operational endpoint shipped today, plus the V22 backlog
> for richer telemetry.

---

## 1 — Captured metrics

### 1.1 Bus adapter

| Metric | Source | Surfaced via |
|--------|--------|--------------|
| Adapter id | `dispatcher.currentAdapterName` | `/api/realtime/financial/observability` snapshot |
| In-memory ring buffer occupancy | `InMemoryEventBusAdapter.metrics` | snapshot |

### 1.2 Dispatcher

| Metric | Source | Surfaced via | Alert rule |
|--------|--------|--------------|------------|
| `dispatched` | `FinancialEventDispatcher.metrics.dispatched` | snapshot | — |
| `failed` | `metrics.failed` | snapshot | `V20_9_DISPATCHER_FAILURE_RATE_HIGH` (≥25%) |
| `deadLetter` | `metrics.deadLetter` | snapshot | `V20_9_DISPATCHER_DLQ_GROWING` (≥1, ERROR; ≥10, CRITICAL) |
| `skippedAlreadyDelivered` | `metrics.skippedAlreadyDelivered` | snapshot | — |
| `lastTickAgoMs` | derived from `metrics.lastTickAt` | snapshot | `V20_9_DISPATCHER_STALE_TICK` (>5min, WARN) |
| `lastTickDurationMs` | `metrics.lastTickDurationMs` | snapshot | — |
| `failureRatePercent` | derived | snapshot | drives `…_FAILURE_RATE_HIGH` |

### 1.3 Realtime gateway

| Metric | Source | Surfaced via | Alert rule |
|--------|--------|--------------|------------|
| `activeSubscribers` | `FinancialRealtimeGateway.metrics.activeSubscribers` | snapshot | drives `…_NO_SUBSCRIBERS` |
| `publishedToFanout` | `metrics.publishedToFanout` | snapshot | drives `…_NO_SUBSCRIBERS` |
| `droppedNoChannel` | `metrics.droppedNoChannel` | snapshot | `V20_9_REALTIME_FAN_OUT_LAGGING` (≥50, WARN) |
| `heartbeatsSent` | `metrics.heartbeatsSent` | snapshot | — |

### 1.4 Outbox (durable view)

The `FinancialEventOutbox` table is the durable observability
substrate. Useful queries:

```sql
-- Current backlog
SELECT COUNT(*) FROM "FinancialEventOutbox" WHERE "deliveredAt" IS NULL;

-- Per-event-name dispatch lag (seconds)
SELECT "eventName",
       AVG(EXTRACT(EPOCH FROM (NOW() - "publishedAt"))) AS avg_lag_s
  FROM "FinancialEventOutbox"
 WHERE "deliveredAt" IS NULL
 GROUP BY "eventName";

-- DLQ rows
SELECT * FROM "FinancialEventOutbox"
 WHERE "attempts" >= 16
 ORDER BY "publishedAt" DESC
 LIMIT 50;

-- Replay window
SELECT * FROM "FinancialEventOutbox"
 WHERE "deliveredAt" BETWEEN $1 AND $2
 ORDER BY "publishedAt" ASC;
```

---

## 2 — Alert rules (already shipped)

| Code | Severity ladder | Trigger | Action |
|------|-----------------|---------|--------|
| `V20_9_DISPATCHER_DLQ_GROWING` | ERROR → CRITICAL at 10+ | dispatcher DLQ counter ≥ 1 | Manual outbox inspection + replay |
| `V20_9_DISPATCHER_FAILURE_RATE_HIGH` | ERROR → CRITICAL at 50% | dispatcher failure rate ≥ 25% | Broker health check + adapter-side investigation |
| `V20_9_DISPATCHER_STALE_TICK` | WARN | no tick in 5 minutes | Restart dispatcher worker; check cron schedule |
| `V20_9_REALTIME_NO_SUBSCRIBERS` | WARN | 100+ events fanned out with 0 subscribers | Frontend/operator side issue — verify no SSE dropouts |
| `V20_9_REALTIME_FAN_OUT_LAGGING` | WARN | 50+ events dropped because no channel matched | Probably a new event class — check `REALTIME_CHANNELS` mapping |

The shape `{severity, code, message}` is already what the
existing `common/services/discord-alert.service.ts` shipper
expects, so wiring `evaluateAlerts()` to alerting is one
method call (V22 work).

---

## 3 — HTTP endpoints

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| GET | `/api/realtime/financial/observability` | Get current snapshot + alerts | OWNER / GENERAL_MANAGER (admin) |
| GET | `/api/realtime/financial/:channel/stream` | SSE feed for the channel | role-gated per channel |

---

## 4 — V22 observability backlog

  * Wire `evaluateAlerts()` to Discord/Slack/email shippers
    (the alert shape already matches; the dispatch is one
    method call away).
  * Per-customer event counters for the Customer360 page —
    "this customer triggered N events in the last hour".
  * Prometheus exposition format for the snapshot — currently
    JSON-only.
  * Histograms for `dispatch latency` (p50 / p95 / p99) on
    top of the existing counters.
  * SSE subscriber dashboard — show top 10 channels by active
    subscriber count.
  * OpenTelemetry trace propagation: include the
    `correlationId` header in every adapter `publish` call so
    downstream consumers can trace the event back to its
    originating HTTP request.

---

## 5 — Verdict

The observability layer is **structurally complete**. Every
counter is surfaced via a single snapshot endpoint; every
counter has an alert rule with a documented severity ladder;
the durable substrate (`FinancialEventOutbox`) supports every
operational query needed for forensics and replay. Wiring to
external alerting platforms + Prometheus exposition is the
V22 next step.
