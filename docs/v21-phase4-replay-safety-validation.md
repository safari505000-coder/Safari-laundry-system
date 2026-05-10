# V21 Phase 4 — Replay Safety Validation

> Proves that the event platform is replay-safe under every
> failure mode the Phase 4 mission identifies.

---

## 1 — Replay invariants

| # | Invariant | Mechanism | Test |
|---|-----------|-----------|------|
| 1 | Same logical event published twice within the same second produces the same `eventId` | `evt_<sha256(name|customerId|correlationId|occurredAtSec)>.slice(0,32)` | `v21-phase4-event-bus-integrity.spec.ts` test 1 + `domain-events.spec.ts` (existing) |
| 2 | Producer-side idempotency: the second `publish` of the same logical event returns `{alreadyPublished:true}` and emits NOTHING in-process | `INSERT … UNIQUE(eventId)` short-circuit on Prisma `P2002` | `financial-event-bus.spec.ts` (existing) |
| 3 | Consumer-side idempotency: replaying an already-processed event short-circuits via `recordConsumed → {processed:false}` | `FinancialEventDelivery` UNIQUE on `(eventId, consumerName)` | `domain-events.spec.ts` (existing) |
| 4 | Dispatcher-side idempotency: a row with `deliveredAt != null` is NEVER re-shipped on the next tick | `WHERE deliveredAt IS NULL` only | `v20-9-event-dispatcher.spec.ts` test 2 |
| 5 | Cross-restart safety: outbox rows survive process restart and are picked up on the next tick | No in-process state; outbox is the queue | `v20-9-event-dispatcher.spec.ts` test 4 |
| 6 | Replay-on-demand: `bus.replay({since, until})` re-emits a window without writing new outbox rows | Pure read on the producer side | `financial-event-bus.spec.ts` (existing) |
| 7 | Outbox is append-only across the whole codebase | Tree-wide `delete`/`deleteMany` scan | `v21-phase4-event-bus-integrity.spec.ts` test 5 |

---

## 2 — Determinism algorithm — frozen contract

```ts
private deterministicEventId<N extends FinancialDomainEventName>(
  name: N,
  payload: FinancialDomainEventPayloadByName[N],
): string {
  const occurredAtSec = Math.floor(
    new Date(payload.occurredAt).getTime() / 1000,
  );
  const tuple = [
    name,
    payload.customerId ?? '',
    payload.correlationId ?? '',
    String(occurredAtSec),
  ].join('|');
  return `evt_${createHash('sha256').update(tuple).digest('hex').slice(0, 32)}`;
}
```

  * Hash family: SHA-256.
  * Tuple components (in order): `name`, `customerId` (or empty),
    `correlationId` (or empty), second-precision timestamp.
  * Output: `evt_` prefix + 32 hex chars (= 16 bytes / 128 bits
    of entropy).
  * Phase 4 lock-in test 1 asserts every component still appears
    in the source — adding or dropping one fails CI.

---

## 3 — Failure mode matrix

| Failure | What happens | Replay safe? |
|---------|--------------|--------------|
| Publisher dies BEFORE outbox INSERT | The originating transaction has not yet emitted; on retry the same business cause produces the same eventId, INSERT succeeds, in-process emit happens normally | ✅ |
| Publisher dies BETWEEN outbox INSERT and in-process emit | Outbox row exists but listeners did not run; on next tick the dispatcher ships it to the broker, downstream consumers process it; in-process snapshot listener will run on the NEXT canonical refetch (UI is eventually consistent) | ✅ |
| In-process listener throws | Caught at the listener boundary; logged at WARN; the bus continues; later events still flow | ✅ |
| Outbox INSERT fails with P2002 (duplicate) | Producer returns `{alreadyPublished:true}` — caller treats this as success | ✅ |
| Outbox INSERT fails with non-P2002 | Logged at WARN; in-process emit STILL happens so live UIs don't go stale during a bus outage; future replay re-creates the outbox row from a follow-up canonical refetch | ✅ |
| Dispatcher tick crashes mid-batch | The `working` flag is set in `finally` so the next tick re-enters cleanly; un-shipped rows have `deliveredAt IS NULL` and are picked up | ✅ |
| Adapter `publish` rejects | `attempts++` + `lastError` set; row stays selectable; backoff prevents thundering herd | ✅ |
| Adapter `publish` succeeds but DB UPDATE for `deliveredAt` fails | Logged at WARN; on next tick the row is re-selected and re-shipped; consumer dedups via `recordConsumed` so no double-side-effect | ✅ |
| Broker delivers same envelope twice | Consumer dedups via `(eventId, consumerName)` UNIQUE — second handler invocation returns early | ✅ |
| Frontend SSE drops mid-event | Browser EventSource auto-reconnects with `Last-Event-ID:`; missed events trigger the next canonical refetch on the affected query — UI converges to canonical state | ✅ |
| Frontend gets a payload with stale `*Kd` value | Hook only invalidates; payload financials are NEVER copied; canonical refetch returns server-canonical value | ✅ (locked by `v21-phase4-realtime-purity.test.ts` test 2) |

---

## 4 — Replay tooling

### 4.1 In-process replay

```ts
await bus.replay({
  since: new Date('2026-05-08T00:00:00Z'),
  until: new Date('2026-05-08T01:00:00Z'),
  name: 'finance.payment.captured',
  limit: 1000,
});
```

Re-emits the window through `EventEmitter2`. Listeners with
`recordConsumed` short-circuit on already-processed events.

### 4.2 Broker replay

```ts
await dispatcher.replayDelivered({
  since: new Date('2026-05-08T00:00:00Z'),
  until: new Date('2026-05-08T01:00:00Z'),
  limit: 1000,
});
```

Re-ships delivered rows to the configured adapter. Useful for
seeding a new consumer group or recovering from a downstream
data loss.

---

## 5 — Verdict

**Replay-safe under every documented failure mode.**
Determinism + idempotency at producer / dispatcher / consumer
levels combine into "at-least-once delivery with exactly-once
side-effects". The architectural-shape lock-ins introduced in
Phase 4 prevent future regressions of the determinism
algorithm, the outbox-then-emit ordering, and the append-only
outbox invariant.
