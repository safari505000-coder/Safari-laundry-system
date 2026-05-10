# V21 Phase 4 — Rollout Guide

> Operational checklist for adopting the broker adapters
> (Kafka / RabbitMQ / Redis Streams) and wiring the SSE
> realtime feed into per-page surfaces.

---

## 1 — Pre-rollout audit

Before flipping any broker on, confirm the following are
healthy on the in-memory adapter:

```pwsh
# Backend Jest — must include the V21 Phase 4 integrity guards
npx jest src/domain-events/

# Frontend Vitest — must include the V21 Phase 4 purity guards
cd web; npx vitest run src/modules/finance/state/v21-phase4-realtime-purity.test.ts

# Outbox backlog should be 0 or steadily draining
psql ... -c 'SELECT COUNT(*) FROM "FinancialEventOutbox" WHERE "deliveredAt" IS NULL'

# DLQ should be 0
psql ... -c 'SELECT COUNT(*) FROM "FinancialEventOutbox" WHERE "attempts" >= 16'
```

---

## 2 — Wave 1: Kafka adapter wiring

### 2.1 Add the broker client

```pwsh
npm install kafkajs
```

### 2.2 Implement `publish` in the stub

`src/domain-events/adapters/kafka-event-bus.adapter.ts`:

```ts
import { Kafka, Producer } from 'kafkajs';

export class KafkaEventBusAdapter implements EventBusAdapter {
  readonly name = 'kafka';
  private producer: Producer;

  constructor(private readonly opts: { brokers: string[]; clientId?: string; topicPrefix?: string }) {
    const kafka = new Kafka({ brokers: opts.brokers, clientId: opts.clientId ?? 'safari-erp' });
    this.producer = kafka.producer({ allowAutoTopicCreation: false, idempotent: true });
  }

  async publish(envelope: EventEnvelope): Promise<void> {
    if (!this.producer) throw new Error('producer not connected');
    await this.producer.send({
      topic: `${this.opts.topicPrefix ?? 'safari.financial-events'}.${envelope.eventName}`,
      acks: -1,
      messages: [{
        key: envelope.customerId ?? envelope.eventId,
        value: JSON.stringify(envelope),
        headers: {
          eventId: envelope.eventId,
          eventName: envelope.eventName,
          correlationId: envelope.correlationId ?? '',
        },
      }],
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.producer.send({ topic: '__health__', messages: [{ value: 'ping' }] }).catch(() => null);
      return true;
    } catch {
      return false;
    }
  }

  async shutdown(): Promise<void> {
    await this.producer.disconnect();
  }
}
```

### 2.3 Register the adapter

`src/app.module.ts` (or a deployment-specific module):

```ts
{
  provide: 'EVENT_BUS_ADAPTER',
  useFactory: () =>
    new KafkaEventBusAdapter({
      brokers: process.env.KAFKA_BROKERS!.split(','),
      clientId: 'safari-erp',
      topicPrefix: 'safari.financial-events',
    }),
}
```

### 2.4 Pre-create topics

Per event class, with `customerId` partition count appropriate
for your traffic. Suggested baseline:

| Event class | Partitions | Retention |
|-------------|-----------:|-----------|
| `safari.financial-events.finance.payment.captured` | 12 | 30 days |
| `safari.financial-events.finance.invoice.issued` | 12 | 30 days |
| `safari.financial-events.finance.snapshot.refreshed` | 6 | 7 days |
| (other event classes) | 3 | 7 days |

### 2.5 Soft launch

  1. Deploy with `EVENT_BUS_ADAPTER` registered but the
     dispatcher cron set to a long interval (e.g. 5 minutes).
  2. Watch `/api/realtime/financial/observability`:
     `dispatcher.dispatched` should grow steadily;
     `dispatcher.failed` and `dispatcher.deadLetter` should
     stay at 0 or near 0.
  3. After 24 hours of clean dispatch, flip the cron to the
     production interval (suggested: 1 second).
  4. After 48 hours of stable production interval, declare
     Kafka primary and remove the in-memory fallback.

### 2.6 Per-tenant rollback

If anything goes wrong, the **rollback is config-only** —
remove the `EVENT_BUS_ADAPTER` provider registration and
restart. The dispatcher falls back to the in-memory adapter
and the outbox keeps growing safely until you re-enable the
broker.

---

## 3 — Wave 2: RabbitMQ adapter wiring

(Same shape as Wave 1, with `amqplib` as the client.)

### 3.1 Topology

  * Exchange: `safari.financial-events` (topic exchange).
  * Binding: per-event-name routing key.
  * Queues created by consumers (no producer-side queue
    declarations).
  * Persistent + mandatory delivery.

---

## 4 — Wave 3: Redis Streams adapter wiring

(Same shape as Wave 1, with `ioredis` as the client.)

### 4.1 Topology

  * Stream key: `safari:financial-events:<eventName>`.
  * `XADD` with `MAXLEN ~ 100000` (approximate trim) for
    capped retention.
  * Consumer groups per service.

---

## 5 — Wave 4: Frontend SSE adoption

The `useRealtimeFinancialFeed` hook is approved and tested but
unwired. V22 implementation surfaces:

| Surface | Channel | Scope | File to edit |
|---------|---------|-------|--------------|
| Customer360 | `customer360` | `customerId` from URL | `web/src/modules/customers/pages/customer-360-page.tsx` (V22 rebuild target) |
| Collections workspace | `collections` | none | `web/src/modules/collections/pages/CollectionsWorkspaceShell.tsx` |
| CC dashboard alerts | `fraud` + `risk` | optional `branchId` | `web/src/modules/call-center/dashboard/pages/cc-dashboard-page.tsx` |
| Reconciliation | `reconciliation` | none | `web/src/pages/cash-reconciliation-page.tsx` |
| Branch accounting | `branch-accounting` | `branchId` from session | `web/src/modules/accountant/pages/InventoryReport.tsx` and similar |

Wiring pattern:

```tsx
import { useRealtimeFinancialFeed } from '@/modules/finance';
import { useAuth } from '@/contexts/auth-context';

function CustomerPage({ customerId }: { customerId: string }) {
  const { token } = useAuth();
  useRealtimeFinancialFeed({
    channel: 'customer360',
    customerId,
    accessToken: token,
  });
  // …rest of component, queries continue using useFinancialQuery
}
```

The hook handles connection lifecycle, reconnect, and
unsubscribe automatically.

---

## 6 — Cross-cutting checklist

  * [ ] Backend Jest passes including the new V21 Phase 4
        integrity guards.
  * [ ] Frontend Vitest passes including the new V21 Phase 4
        purity guards.
  * [ ] Outbox backlog steadily drains.
  * [ ] DLQ stays at 0.
  * [ ] `dispatcher.lastTickAgoMs` stays under 5 minutes.
  * [ ] `realtime.activeSubscribers` matches operator login
        count (after V22 SSE adoption).
  * [ ] Alert shipper wired (V22).
