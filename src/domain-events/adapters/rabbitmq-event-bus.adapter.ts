import { Logger } from '@nestjs/common';
import type { EventBusAdapter, EventEnvelope } from './event-bus-adapter';

/**
 * V20.9 — Phase 1 RabbitMqEventBusAdapter (stub).
 *
 * Recommended client: `amqplib`.
 *
 * Exchange convention:
 *   topic exchange `safari.financial-events`. Routing key =
 *   `<eventName>` (e.g. `finance.payment.captured`). Consumers
 *   bind queues to wildcards (`finance.payment.*`).
 *
 * Persistence:
 *   Publish with `persistent: true` so messages survive a broker
 *   restart. Consumer uses manual ack — and only acks AFTER the
 *   `recordConsumed` row is written. A crash between work and ack
 *   re-delivers; the idempotent consumer skips the duplicate.
 */
export class RabbitMqEventBusAdapter implements EventBusAdapter {
  readonly name = 'rabbitmq';

  private readonly logger = new Logger(RabbitMqEventBusAdapter.name);

  constructor(
    private readonly opts: {
      url: string;
      exchange?: string;
    },
  ) {}

  async publish(envelope: EventEnvelope): Promise<void> {
    // TODO(deploy): replace with amqplib publish.
    // const channel = await this.getChannel();
    // const exchange = this.opts.exchange ?? 'safari.financial-events';
    // const ok = channel.publish(
    //   exchange,
    //   envelope.eventName,
    //   Buffer.from(JSON.stringify(envelope)),
    //   {
    //     persistent: true,
    //     messageId: envelope.eventId,
    //     timestamp: envelope.publishedAt,
    //     headers: { customerId: envelope.customerId ?? '' },
    //   },
    // );
    // if (!ok) await new Promise<void>((res) => channel.once('drain', res));
    this.logger.warn(
      `[V20_9_RABBITMQ_ADAPTER_NOT_WIRED] eventId=${envelope.eventId}; stub adapter — see RabbitMqEventBusAdapter for wiring instructions`,
    );
    throw new Error(
      'RabbitMqEventBusAdapter is a stub — implement publish() before registering in production',
    );
  }

  async healthCheck(): Promise<boolean> {
    // TODO(deploy): channel.checkExchange().
    return false;
  }

  async shutdown(): Promise<void> {
    // TODO(deploy): channel.close() + connection.close().
  }
}
