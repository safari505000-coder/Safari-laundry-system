/**
 * V20.9 — Phase 1 EventBusAdapter contract.
 *
 * The {@link FinancialEventBus} (V20.6) writes to the outbox and
 * fires in-process listeners. V20.9 adds the *dispatcher* — an
 * independent worker that ships outbox rows to an external broker
 * (Kafka / RabbitMQ / Redis Streams). The broker choice is a
 * deployment concern and MUST NOT change a single line of producer
 * code.
 *
 * This file defines the single contract every adapter implements:
 *
 *   • `name` — short id used for log lines + metrics
 *   • `publish(envelope)` — ship one event; resolves on broker ack
 *   • `healthCheck()` — non-throwing probe (true = healthy)
 *
 * The dispatcher only ever calls these three methods. Adding a new
 * broker is "implement EventBusAdapter + register in
 * `EventBusAdapterRegistry`" — zero changes elsewhere.
 *
 * Guarantees the adapter MUST honor:
 *
 *   • At-least-once delivery to the broker (we accept duplicates;
 *     the consumer is idempotent via `recordConsumed`).
 *   • Synchronous on-ack resolution — `publish` resolves only AFTER
 *     the broker has durably acknowledged.
 *   • Errors thrown / promise rejection signal a retryable failure;
 *     the dispatcher will increment `attempts` and retry with
 *     exponential backoff.
 *   • `healthCheck` MUST NOT throw. Return `false` for "degraded"
 *     and the dispatcher pauses the worker until the next cycle.
 */
export type EventEnvelope = {
  /** Deterministic SHA-256 event id from the outbox. */
  eventId: string;
  /** `finance.<domain>.<verb>` — see FinancialDomainEventName. */
  eventName: string;
  /** Customer scope (UUID) — useful as Kafka partition key. */
  customerId: string | null;
  /** Producer-supplied correlation id (e.g. payment id). */
  correlationId: string | null;
  /** ISO-8601 of when the originating write committed. */
  occurredAt: string;
  /** Full event payload as persisted by the bus. */
  payload: unknown;
  /** Monotonically-increasing publish time (ms since epoch). */
  publishedAt: number;
};

export interface EventBusAdapter {
  /** Short adapter identifier — `in-memory`, `redis-streams`, `kafka`, `rabbitmq`. */
  readonly name: string;
  /** Ship one event; resolve after broker durable-ack. */
  publish(envelope: EventEnvelope): Promise<void>;
  /** Non-throwing health probe (true = healthy, false = degraded). */
  healthCheck(): Promise<boolean>;
  /** Optional shutdown hook (closes broker client cleanly). */
  shutdown?(): Promise<void>;
}
