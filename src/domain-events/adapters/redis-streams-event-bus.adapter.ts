import { Logger } from '@nestjs/common';
import type { EventBusAdapter, EventEnvelope } from './event-bus-adapter';

/**
 * V20.9 — Phase 1 RedisStreamsEventBusAdapter (stub).
 *
 * Default fallback when no Kafka / RabbitMQ broker is available.
 * Redis Streams gives us:
 *
 *   • Durable, append-only log per stream
 *   • Consumer groups (each group reads independently)
 *   • XADD is at-least-once delivery (we are idempotent at the
 *     consumer via {@link FinancialEventBus.recordConsumed})
 *   • XACK + XPENDING for delivery tracking
 *
 * The actual Redis client is intentionally NOT instantiated here
 * — V20.9 ships the contract + InMemory default. Wiring the real
 * `ioredis` (or `node-redis`) client is a one-file deployment
 * concern: implement the marked TODOs and register this adapter
 * in `EventBusAdapterRegistry` instead of the in-memory one.
 *
 * Stream key convention:
 *   `safari:financial-events:<eventName>` — partitioned by event
 *   type so consumer groups can scale per event class.
 */
export class RedisStreamsEventBusAdapter implements EventBusAdapter {
  readonly name = 'redis-streams';

  private readonly logger = new Logger(RedisStreamsEventBusAdapter.name);

  constructor(
    private readonly opts: { url: string; streamPrefix?: string },
  ) {}

  async publish(envelope: EventEnvelope): Promise<void> {
    // TODO(deploy): replace with ioredis XADD.
    // const redis = await this.getClient();
    // await redis.xadd(
    //   `${this.opts.streamPrefix ?? 'safari:financial-events'}:${envelope.eventName}`,
    //   '*',
    //   'eventId', envelope.eventId,
    //   'payload', JSON.stringify(envelope),
    // );
    this.logger.warn(
      `[V20_9_REDIS_ADAPTER_NOT_WIRED] eventId=${envelope.eventId}; stub adapter — see RedisStreamsEventBusAdapter for wiring instructions`,
    );
    throw new Error(
      'RedisStreamsEventBusAdapter is a stub — implement publish() before registering in production',
    );
  }

  async healthCheck(): Promise<boolean> {
    // TODO(deploy): PING the redis client.
    return false;
  }

  async shutdown(): Promise<void> {
    // TODO(deploy): close the redis client cleanly.
  }
}
