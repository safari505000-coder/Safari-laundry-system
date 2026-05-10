import { Injectable, Logger } from '@nestjs/common';
import type { EventBusAdapter, EventEnvelope } from './event-bus-adapter';

/**
 * V20.9 — Phase 1 InMemoryEventBusAdapter.
 *
 * Default adapter used in single-node deployments + CI. Stores
 * shipped envelopes in a bounded ring buffer so tests + the
 * observability dashboard can inspect the last N delivered
 * events without touching the database.
 *
 * Production deployments swap this for KafkaEventBusAdapter,
 * RabbitMqEventBusAdapter, or RedisStreamsEventBusAdapter via
 * {@link EventBusAdapterRegistry}.
 */
@Injectable()
export class InMemoryEventBusAdapter implements EventBusAdapter {
  readonly name = 'in-memory';

  private readonly logger = new Logger(InMemoryEventBusAdapter.name);
  private readonly buffer: EventEnvelope[] = [];
  private readonly bufferLimit = 1024;
  /** Optional fault-injection for tests. */
  private failNextN = 0;

  async publish(envelope: EventEnvelope): Promise<void> {
    if (this.failNextN > 0) {
      this.failNextN -= 1;
      throw new Error(
        `[InMemoryEventBusAdapter] simulated broker failure for eventId=${envelope.eventId}`,
      );
    }
    this.buffer.push(envelope);
    if (this.buffer.length > this.bufferLimit) {
      this.buffer.shift();
    }
    this.logger.debug(
      `[V20_9_EVENT_BUS_ADAPTER_DELIVERED] adapter=in-memory eventId=${envelope.eventId} eventName=${envelope.eventName}`,
    );
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  /** Test-only — returns the most recent N delivered envelopes. */
  recent(n = 16): EventEnvelope[] {
    return this.buffer.slice(-n);
  }

  /** Test-only — fail the next N publish() calls. */
  __failNext(n: number): void {
    this.failNextN = n;
  }

  /** Test-only — reset the buffer (used by tests + the admin endpoint). */
  __reset(): void {
    this.buffer.length = 0;
    this.failNextN = 0;
  }
}
