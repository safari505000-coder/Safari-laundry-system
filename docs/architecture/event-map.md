# Safari ERP — Domain Event Map

> Every domain event in Safari ERP, who produces it, who consumes it,
> what payload it carries, and how it behaves under retry / replay.
>
> The bus is `@nestjs/event-emitter` (in-process, configured at
> `AppModule` via `EventEmitterModule.forRoot`). Future migration to
> Redis Streams / RabbitMQ / Kafka uses the adapter pattern in
> `src/domain-events/adapters/` — the contract surface stays the
> same.
>
> **Event names are typed** in
> [`src/domain-events/financial-domain-event.types.ts`](../../src/domain-events/financial-domain-event.types.ts).
> Adding a new event MUST extend that file FIRST, then add a row
> here.
>
> Companion documents:
>
> - [`financial-core.md`](./financial-core.md)
> - [`payment-flows.md`](./payment-flows.md)
> - [`invariants.md`](./invariants.md)
> - [`module-ownership.md`](./module-ownership.md)

---

## 1. Event taxonomy

All events are namespaced under `finance.*` (the
`FINANCIAL_DOMAIN_EVENT_PREFIX` constant). Naming convention:
`noun.past-tense` so wildcard subscribers (`finance.*`) can fan out
without enumerating types.

| Prefix | Domain |
| --- | --- |
| `finance.invoice.*` | Invoice lifecycle |
| `finance.payment.*` | Payment captures (cash, KNET, gateway) |
| `finance.wallet.*` | Wallet absorption / adjustment |
| `finance.refund.*` | Refunds / reversals |
| `finance.subscription.*` | Subscription lifecycle |
| `finance.collection.*` | Collections workflow |
| `finance.promise.*` | Promise-to-pay state machine |
| `finance.fraud.*` | Fraud alerts |
| `finance.snapshot.*` | Snapshot refresh notifications |
| `finance.risk.*` | Risk-score recalculations |
| `finance.reconciliation.*` | Reconciliation drift signals |

---

## 2. Full event catalogue

### `finance.invoice.issued`

| Field | Value |
| --- | --- |
| Producer | `OrdersService.posCheckout` (and the V21 enhanced settlement path) |
| Trigger | An order completes (state PENDING → COMPLETED) and the journal entry is written |
| Payload | `customerId, orderId, correlationId, occurredAt, invoiceTotalKd: string, posPaymentMethod: string \| null` |
| Idempotency | The journal `sourceRef = INVOICE_ISSUANCE:<orderId>` already deduplicates the *write*; the event itself is fire-and-forget. Duplicate events trigger a duplicate snapshot refresh, which is itself idempotent. |
| Retry behaviour | On listener failure: logged + counter incremented; the **next** snapshot cron run reconciles. Fire-and-forget; the financial write is NOT rolled back if the event listener throws. |
| Replay behaviour | Replaying historical events from the outbox results in N snapshot refreshes — all idempotent. |
| Consumers | `FinancialSnapshotListener` → `snapshot.refreshOne(customerId, INVOICE_ISSUED)` |

### `finance.invoice.reversed`

| Field | Value |
| --- | --- |
| Producer | `InvoiceAuditService.voidInvoice` |
| Trigger | A supervisor voids an invoice |
| Payload | `customerId, orderId, correlationId, occurredAt, reversedAmountKd: string, reason?: string` |
| Idempotency | Journal `sourceRef = JOURNAL:INVOICE_CANCELED:<orderId>` deduplicates write. Event is fire-and-forget. |
| Retry behaviour | Listener failure → logged + cron reconciles. |
| Replay behaviour | Idempotent snapshot refresh. |
| Consumers | `FinancialSnapshotListener` → `CRON_RECONCILE` source |

### `finance.payment.captured`

| Field | Value |
| --- | --- |
| Producer | `PaymentsService.manuallyMarkOrderPaidByMethod`, gateway finalize path |
| Trigger | A payment is captured (gateway returns CAPTURED, OR manual mark-paid) |
| Payload | `customerId, orderId, correlationId, occurredAt, amountKd: string, paymentMethod: string` |
| Idempotency | `sourceRef = PAYMENT:<paymentId>` on journal deduplicates. |
| Retry behaviour | Listener failure → logged + cron reconciles. |
| Replay behaviour | Idempotent snapshot refresh. |
| Consumers | `FinancialSnapshotListener` → `PAYMENT_CAPTURED` source |

### `finance.payment.partial`

| Field | Value |
| --- | --- |
| Producer | `CustomerLedgerService.recordDebtInvoiceCollectedAtCallCenter` |
| Trigger | A partial payment is recorded against a debt invoice (e.g. CC office cash) |
| Payload | `customerId, orderId, correlationId, occurredAt, amountKd: string, paymentMethod: string` |
| Idempotency | Same as `payment.captured`. |
| Retry behaviour | Same. |
| Replay behaviour | Same. |
| Consumers | `FinancialSnapshotListener` → `PARTIAL_PAYMENT_RECORDED` source |

### `finance.wallet.absorbed`

| Field | Value |
| --- | --- |
| Producer | `CustomerLedgerService.runPrepaidAutoReconcileForCustomer`, settlement path |
| Trigger | Wallet credit is absorbed against an outstanding debt invoice |
| Payload | `customerId, orderId, correlationId, occurredAt, amountKd: string` |
| Idempotency | Journal `sourceRef = WALLET_ABSORB:<orderId>:<seq>` deduplicates. |
| Retry behaviour | Listener failure → logged + cron reconciles. |
| Replay behaviour | Idempotent. |
| Consumers | `FinancialSnapshotListener` → `WALLET_ABSORBED` source |

### `finance.wallet.adjusted`

| Field | Value |
| --- | --- |
| Producer | Wallet adjustment paths (admin correction with explicit reason) |
| Trigger | An out-of-band wallet adjustment is committed (rare; admin-only) |
| Payload | `customerId, correlationId, occurredAt, deltaKd: string, reason?: string` |
| Idempotency | Caller-supplied `correlationId`; journal carries the unique `sourceRef`. |
| Retry behaviour | Listener failure → logged + cron reconciles. |
| Replay behaviour | Idempotent. |
| Consumers | `FinancialSnapshotListener` → `CRON_RECONCILE` source |

### `finance.refund.created`

| Field | Value |
| --- | --- |
| Producer | `InvoiceAuditService.voidInvoice` (when wallet portion is refunded) |
| Trigger | A wallet absorption is reversed because the underlying invoice was voided |
| Payload | `customerId, orderId, correlationId, occurredAt, amountKd: string, refundType: 'CASH' \| 'WALLET' \| 'GIFT_REMOVAL'` |
| Idempotency | Journal `sourceRef = JOURNAL:WALLET_ABSORPTION_VOID:<orderId>`. |
| Retry behaviour | Same. |
| Replay behaviour | Idempotent. |
| Consumers | `FinancialSnapshotListener` → `CRON_RECONCILE` source |

### `finance.subscription.activated`

| Field | Value |
| --- | --- |
| Producer | `SubscribersService.activateSubscription`, `subscriptions/` activation path |
| Trigger | A subscription transitions from CREATED → ACTIVE |
| Payload | `customerId, correlationId, occurredAt, planId: string, expiresAt: string` |
| Idempotency | `CustomerSubscription.id` is the unique constraint; activating an already-ACTIVE subscription is a no-op. |
| Retry behaviour | Listener failure → logged + cron reconciles. |
| Replay behaviour | Idempotent. |
| Consumers | `FinancialSnapshotListener` → `SUBSCRIPTION_ACTIVATED` source |

### `finance.subscription.expired`

| Field | Value |
| --- | --- |
| Producer | `SubscribersService.markExpired`, expiry cron |
| Trigger | A subscription transitions ACTIVE → EXPIRED |
| Payload | `customerId, correlationId, occurredAt, expiredAt: string` |
| Idempotency | Status transition is idempotent (already-EXPIRED short-circuits). |
| Retry behaviour | Same. |
| Replay behaviour | Idempotent. |
| Consumers | `FinancialSnapshotListener` (no specific source — falls through to `CRON_RECONCILE`) |

### `finance.collection.escalated`

| Field | Value |
| --- | --- |
| Producer | `CollectionsWorkflowService.escalate`, severity transitions |
| Trigger | Collections stage transitions to a more severe stage (e.g. CONTACTED → ESCALATED) |
| Payload | `customerId, orderId, correlationId, occurredAt, severity: 'reminder' \| 'warning' \| 'block' \| 'legal'` |
| Idempotency | `CollectionsStageEvent` is append-only; duplicate escalations write extra rows but the projection collapses by current stage. |
| Retry behaviour | Listener failure → logged + cron reconciles. |
| Replay behaviour | Idempotent (projection is `MAX(createdAt)` per customer). |
| Consumers | `FinancialSnapshotListener` → `COLLECTION_ESCALATED` source |

### `finance.collection.stage.changed`

| Field | Value |
| --- | --- |
| Producer | `CollectionsWorkflowService.transition` (every stage change, V20.9+) |
| Trigger | Any collections stage transition (NEW → CONTACTED → … → WRITTEN_OFF) |
| Payload | `customerId, correlationId, occurredAt, fromStage: string, toStage: string, reason?: string` |
| Idempotency | Same as `collection.escalated`. |
| Retry behaviour | Same. |
| Replay behaviour | Same. |
| Consumers | `FinancialSnapshotListener` (default `CRON_RECONCILE`); `CollectionsReadModel` projector |

### `finance.invoice.overdue`

| Field | Value |
| --- | --- |
| Producer | `AgingService` (overdue scan cron) |
| Trigger | An invoice crosses an overdue threshold (e.g. > 30 days unpaid) |
| Payload | `customerId, orderId, correlationId, occurredAt, daysOverdue: number` |
| Idempotency | Threshold-based; duplicates are absorbed by the consumer (snapshot recompute is idempotent). |
| Retry behaviour | Listener failure → logged. |
| Replay behaviour | Idempotent. |
| Consumers | `FinancialSnapshotListener`; `CollectionsReadModel` |

### `finance.promise.created`

| Field | Value |
| --- | --- |
| Producer | `PromisesService.recordPromise` |
| Trigger | A customer makes a promise-to-pay |
| Payload | `customerId, correlationId, occurredAt, promiseId: string, promisedAmountKd: string, promisedDate: string` |
| Idempotency | `PromiseEvent` is append-only; duplicate event creates a separate row but the projection collapses on `promiseId`. |
| Retry behaviour | Listener failure → logged + cron reconciles. |
| Replay behaviour | Idempotent. |
| Consumers | `FinancialSnapshotListener`; `CollectionsReadModel` |

### `finance.promise.broken`

| Field | Value |
| --- | --- |
| Producer | `PromisesService.markBroken`, scheduled scan |
| Trigger | A promise's `promisedDate` passes without payment |
| Payload | `customerId, correlationId, occurredAt, promiseId: string, promisedAmountKd: string` |
| Idempotency | Same as `promise.created`. |
| Retry behaviour | Same. |
| Replay behaviour | Idempotent. |
| Consumers | `FinancialSnapshotListener`; `CollectionsReadModel` |

### `finance.promise.kept`

| Field | Value |
| --- | --- |
| Producer | `PromisesService.markKept`, payment reconciliation |
| Trigger | A promise is fulfilled (payment matches the promise) |
| Payload | `customerId, correlationId, occurredAt, promiseId: string` |
| Idempotency | Same. |
| Retry behaviour | Same. |
| Replay behaviour | Same. |
| Consumers | Same. |

### `finance.fraud.alert.created`

| Field | Value |
| --- | --- |
| Producer | `FraudDetectionService` (5 detectors) |
| Trigger | A fraud detector fires |
| Payload | `customerId, correlationId, occurredAt, alertId: string, type: string, severity: 'LOW' \| 'MEDIUM' \| 'HIGH' \| 'CRITICAL'` |
| Idempotency | `FraudAlert.fingerprint` (deterministic per detector) prevents duplicate alerts. |
| Retry behaviour | Listener failure → logged. |
| Replay behaviour | Idempotent. |
| Consumers | `FinancialSnapshotListener`; Discord alert channel (via webhook handler) |

### `finance.snapshot.refreshed`

| Field | Value |
| --- | --- |
| Producer | `FinancialSnapshotService.refreshOne` (after a successful snapshot recompute) |
| Trigger | Any snapshot refresh (event-driven OR cron) |
| Payload | `customerId, correlationId, occurredAt, refreshSource: string` |
| Idempotency | The snapshot itself is idempotent (`UPDATE … SET …` with deterministic inputs). |
| Retry behaviour | Self-loop guard: `FinancialSnapshotListener.handle` skips events with name == `finance.snapshot.refreshed` to prevent infinite loops. |
| Replay behaviour | N/A (this is downstream-of-refresh). |
| Consumers | Realtime gateway (broadcasts to subscribed UI clients via SSE / WebSocket) |

### `finance.risk.recalculated`

| Field | Value |
| --- | --- |
| Producer | `RiskScoringService.recompute`, risk recompute scheduler |
| Trigger | A customer's risk score is recomputed (manual or scheduled) |
| Payload | `customerId, correlationId, occurredAt, score: number, level: 'LOW' \| 'MEDIUM' \| 'HIGH' \| 'CRITICAL'` |
| Idempotency | Idempotent (same inputs → same score; `inputDigest` proves it). |
| Retry behaviour | Listener failure → logged. |
| Replay behaviour | Idempotent. |
| Consumers | `FinancialSnapshotListener`; `RiskRecalculationHistory` writer |

### `finance.reconciliation.failed`

| Field | Value |
| --- | --- |
| Producer | `ReconciliationService` (cron + on-demand) |
| Trigger | Any reconciliation identity returns DRIFT > 0 |
| Payload | `customerId, correlationId, occurredAt, reconciliationId: string, expectedKd: string, observedKd: string, severity: 'WARN' \| 'ERROR' \| 'CRITICAL'` |
| Idempotency | Each `ReconciliationRun.id` is unique; duplicates collapse by id. |
| Retry behaviour | Listener failure → logged. **Discord alert fires** for ERROR / CRITICAL — see [`operational-runbooks/reconciliation-drift.md`](./operational-runbooks/reconciliation-drift.md). |
| Replay behaviour | Idempotent. |
| Consumers | Discord alert handler; `FinancialSnapshotListener` |

---

## 3. The single subscriber pattern

Today there is **one principal subscriber** that fans `finance.*`
out to snapshot refresh:

```ts
// src/domain-events/handlers/financial-snapshot.listener.ts
@Injectable()
export class FinancialSnapshotListener {
  @OnEvent('finance.*', { async: true })
  handle(event: FinancialDomainEvent): void {
    if (!event?.payload?.customerId) return;
    if (event.name === 'finance.snapshot.refreshed') return;

    const source = SOURCE_MAP[event.name] ?? 'CRON_RECONCILE';
    if (this.refresher) {
      this.refresher.request(event.payload.customerId, source, event.payload.correlationId ?? null);
    } else {
      this.snapshots.refreshOneInBackground(event.payload.customerId, source, event.payload.correlationId ?? null);
    }
  }
}
```

Why one subscriber? Because adding a new event automatically gets a
snapshot refresh — no per-event wiring change. The event-name →
snapshot-source mapping is centralised in `SOURCE_MAP` so operators
can grep `[FINANCIAL_SNAPSHOT_REFRESH] source=…` in logs and trace
back to the originating financial write.

---

## 4. Outbox + delivery

The event bus is in-process today. To survive process crashes and
support cross-process consumers, every event is **also written to
the outbox**:

| Table | Purpose | Mutation profile |
| --- | --- | --- |
| `FinancialEventOutbox` | One row per emitted event (timestamp, name, payload). | INSERT only (DB trigger). |
| `FinancialEventDelivery` | One row per delivery attempt to a specific consumer. | INSERT only (DB trigger). |

The outbox is the **replay source of truth**. To rebuild any
projection from scratch:

1. Drop the projection.
2. Read the outbox in chronological order.
3. Re-emit each event to the projector.
4. Verify final projection equals expected.

The outbox is also the **append-only audit log** for events. Every
domain event ever fired is recoverable.

---

## 5. Adapter strategy (future-proofing)

The bus today is `@nestjs/event-emitter` (in-process). The adapters
in `src/domain-events/adapters/` allow operators to swap in:

| Adapter | When to use |
| --- | --- |
| `in-memory-event-bus.adapter.ts` | Single-process deployments (current default). |
| `redis-streams-event-bus.adapter.ts` | Multi-process deployment with low-latency streaming. |
| `rabbitmq-event-bus.adapter.ts` | Operator already has RabbitMQ. |
| `kafka-event-bus.adapter.ts` | High-throughput multi-tenant. |

The adapter pattern means the producer / consumer code does **not
change** when the transport changes. The contract (event name +
payload) is the same. The outbox guarantees no event is lost
across the swap.

---

## 6. Realtime gateway (V20.9+)

After the snapshot listener fires, a separate consumer in
`src/domain-events/realtime/` re-emits the relevant events over
WebSocket / SSE so connected UI clients can refresh in <1s without
polling:

- `FinancialRealtimeGateway` (WebSocket gateway).
- `FinancialRealtimeController` (SSE fallback).

Subscribers identify themselves by `customerId` (for the
customer-facing portal) or by `branchId` (for operational
dashboards). The gateway scopes broadcasts so each socket only
receives events relevant to its subscription.

---

## 7. Idempotency strategies (summary)

Every event carries enough information to be safely retried or
replayed:

| Layer | Mechanism |
| --- | --- |
| Database | UNIQUE `JournalEntry.sourceRef`, UNIQUE `FraudAlert.fingerprint`, UNIQUE `PromiseToPay.id`, etc. |
| Producer | Caller computes deterministic `sourceRef` / `fingerprint` from the business id (not the gateway id). |
| Bus | Fire-and-forget; transport failures don't roll back the financial write. |
| Subscriber | Snapshot refresh is idempotent (`UPDATE … SET …` with deterministic inputs). Read-model projectors compare versions. |
| Outbox | INSERT-only audit log; replays produce the same downstream state. |

---

## 8. Retry strategies

| Failure mode | Behaviour |
| --- | --- |
| Bus delivery throws synchronously | Caught + logged + counter incremented; **financial write is NOT rolled back**. The outbox row guarantees the event is recoverable. |
| Subscriber throws | Caught at the subscriber boundary (`FinancialSnapshotListener.handle` wraps in try/catch). Logged + counter incremented. |
| Realtime broadcast fails | Best-effort; UI clients will catch up on next poll or via reconnect snapshot. |
| Outbox write fails | The financial transaction itself rolls back (the outbox INSERT is in the same `$transaction`). This is the only failure mode that aborts the business write. |
| Snapshot refresh fails | Logged + retried by the next cron run (5-min cadence). The snapshot is **always rebuildable** from the journal so eventual consistency is guaranteed. |

---

## 9. Replay strategies

When you need to replay events:

| Scope | How |
| --- | --- |
| Single customer | `FinancialSnapshotService.refreshOne(customerId, 'MANUAL_REBUILD')` — reads the journal, recomputes, writes the snapshot. |
| All customers | `FinancialSnapshotService.rebuildAll()` — drops the table, refreshes every customer. |
| Historical event | Read the outbox row, re-emit to the bus, observe convergence. |
| Full system | Drop all materialised projections, replay outbox in chronological order, verify trial balance + reconciliation identities pass. |

The Phase 3 contract tests assert that `replayStatementSnapshot(events)`
equals the stored snapshot for every covered customer — this is the
**replay equality invariant** ([`invariants.md` §12](./invariants.md#12-the-replay-equality-invariant)).

---

## 10. Adding a new event (checklist)

1. Add the literal name to `FinancialDomainEventName` in
   `src/domain-events/financial-domain-event.types.ts`.
2. Add the payload shape to `FinancialDomainEventPayloadByName`.
3. Add the source mapping in
   `src/domain-events/handlers/financial-snapshot.listener.ts`
   `SOURCE_MAP` (if it should trigger a snapshot refresh).
4. Add a row to this document under §2.
5. Add a unit test in `src/domain-events/domain-events.spec.ts`
   asserting:
   - The event publishes successfully.
   - Subscribers receive the typed payload.
   - The outbox row is written with the correct shape.
6. Run the V21 banking guard suite to confirm no UI consumer
   accidentally reads the event payload as financial truth (events
   are notifications, not the source).

---

## 11. Forbidden patterns

| Pattern | Why it's forbidden | Where to put it instead |
| --- | --- | --- |
| Throwing from a subscriber back into the producer's transaction | Bus failures must NEVER abort financial writes | Catch-all at the subscriber; log + counter |
| Producer waiting on subscriber acknowledgement | Bus is fire-and-forget; awaiting the subscriber serialises the request | Use the outbox + reconciliation cron |
| Consumer reading the event payload as financial truth | Payloads are notifications, not the canonical state | Read the canonical projection (snapshot, journal) |
| Adding an event without typing it | Untyped events break wildcard subscribers | Always extend `FinancialDomainEventName` first |
| Re-publishing `finance.snapshot.refreshed` from a snapshot consumer | Infinite loop | The listener already guards this; don't reintroduce it |
