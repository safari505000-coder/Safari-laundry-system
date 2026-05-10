import { Logger } from '@nestjs/common';
import type { EventBusAdapter, EventEnvelope } from './event-bus-adapter';

/**
 * V20.9 — Phase 1 KafkaEventBusAdapter (stub).
 *
 * Production-ready stub for the Kafka deployment path.
 * Recommended client: `kafkajs` (battle-tested, no native deps).
 *
 * Topic convention:
 *   `safari.financial-events.<eventName>` — one topic per event
 *   class so partition counts can be tuned per workload.
 *
 * Partition key:
 *   `customerId` — guarantees per-customer ordering at the
 *   partition level (the same customer's events are always
 *   handled by the same consumer instance, no race).
 *
 * Idempotency:
 *   We rely on consumer-side dedup via
 *   {@link FinancialEventBus.recordConsumed}. Kafka's transactional
 *   producer gives us exactly-once at the broker, but we still
 *   need consumer dedup because a consumer crash between work and
 *   offset commit would re-deliver.
 */
export class KafkaEventBusAdapter implements EventBusAdapter {
  readonly name = 'kafka';

  private readonly logger = new Logger(KafkaEventBusAdapter.name);

  constructor(
    private readonly opts: {
      brokers: string[];
      clientId?: string;
      topicPrefix?: string;
    },
  ) {}

  async publish(envelope: EventEnvelope): Promise<void> {
    // TODO(deploy): replace with kafkajs producer.send.
    // const producer = await this.getProducer();
    // await producer.send({
    //   topic: `${this.opts.topicPrefix ?? 'safari.financial-events'}.${envelope.eventName}`,
    //   messages: [{
    //     key: envelope.customerId ?? envelope.eventId,
    //     value: JSON.stringify(envelope),
    //     headers: {
    //       eventId: envelope.eventId,
    //       eventName: envelope.eventName,
    //       correlationId: envelope.correlationId ?? '',
    //     },
    //   }],
    //   acks: -1, // all in-sync replicas
    // });
    this.logger.warn(
      `[V20_9_KAFKA_ADAPTER_NOT_WIRED] eventId=${envelope.eventId}; stub adapter — see KafkaEventBusAdapter for wiring instructions`,
    );
    throw new Error(
      'KafkaEventBusAdapter is a stub — implement publish() before registering in production',
    );
  }

  async healthCheck(): Promise<boolean> {
    // TODO(deploy): producer.connect() + describeCluster().
    return false;
  }

  async shutdown(): Promise<void> {
    // TODO(deploy): producer.disconnect().
  }
}
