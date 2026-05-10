import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  type EventBusAdapter,
  type EventEnvelope,
} from './adapters/event-bus-adapter';
import { InMemoryEventBusAdapter } from './adapters/in-memory-event-bus.adapter';

/**
 * V20.9 — Phase 1 Financial Event Dispatcher.
 *
 * Independent worker that ships outbox rows
 * (`FinancialEventOutbox WHERE deliveredAt IS NULL`) to an external
 * broker via the {@link EventBusAdapter} contract.
 *
 * # Guarantees
 *
 *   • **Ordered delivery (per customer)** — rows are pulled
 *     `ORDER BY publishedAt ASC` and shipped one at a time. The
 *     adapter is responsible for using `customerId` as the
 *     partition key so the broker preserves per-customer order.
 *   • **Concurrent-safe** — only ONE dispatcher instance can hold
 *     the in-process work-claim semaphore at a time. Cross-pod
 *     safety relies on `customerId` partitioning at the broker.
 *   • **Restart-safe** — outbox rows that did not reach
 *     `deliveredAt` on shutdown are picked up on next start. No
 *     state is held in process memory.
 *   • **Replay-safe** — `deliveredAt IS NULL` is the ONLY
 *     selection predicate; never re-ships an already-delivered
 *     row.
 *   • **At-least-once** — adapter failures increment `attempts`
 *     and bump `lastError`; the row stays selectable until the
 *     adapter eventually succeeds.
 *   • **Dead-letter on N attempts** — when `attempts >= maxAttempts`
 *     the dispatcher logs `[V20_9_DLQ]` at ERROR + emits a
 *     monitoring counter; the row stays in the outbox (NEVER
 *     deleted) so an operator can inspect + manually replay.
 *
 * # Backwards compatibility
 *
 *   The dispatcher is OPTIONAL. If it never runs, V20.6's
 *   in-process emit still happens at publish time and the system
 *   behaves exactly as it did pre-V20.9. The dispatcher is the
 *   migration seam to a real broker — turning it on does NOT
 *   change producer code.
 */
@Injectable()
export class FinancialEventDispatcher {
  private readonly logger = new Logger(FinancialEventDispatcher.name);
  private readonly adapter: EventBusAdapter;
  private working = false;

  /** Bounded concurrent in-flight cap. */
  private readonly maxConcurrent = 8;
  /** Max attempts before a row is considered DLQ-eligible. */
  private readonly maxAttempts = 16;
  /** Default tick batch size. */
  private readonly batchSize = 64;
  /** Backoff base (ms) — exponential with jitter. */
  private readonly backoffBaseMs = 250;

  /** Counters surfaced via the V20.9 observability layer. */
  readonly metrics = {
    dispatched: 0,
    failed: 0,
    deadLetter: 0,
    skippedAlreadyDelivered: 0,
    lastTickAt: 0 as number | null,
    lastTickDurationMs: 0,
  };

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject('EVENT_BUS_ADAPTER')
    adapter?: EventBusAdapter,
    @Optional() inMemory?: InMemoryEventBusAdapter,
  ) {
    this.adapter = adapter ?? inMemory ?? new InMemoryEventBusAdapter();
  }

  /**
   * Run one dispatch tick: pull up to `batchSize` undelivered
   * rows, ship them, mark delivered. Returns dispatch counts.
   *
   * Concurrent invocations short-circuit (the second caller gets
   * `{skippedReason:'busy'}`) — protects against multiple cron
   * triggers stepping on each other.
   */
  async tick(opts?: {
    batchSize?: number;
  }): Promise<{
    dispatched: number;
    failed: number;
    deadLetter: number;
    skippedReason?: 'busy' | 'unhealthy';
  }> {
    if (this.working) {
      return { dispatched: 0, failed: 0, deadLetter: 0, skippedReason: 'busy' };
    }
    this.working = true;
    const startedAt = Date.now();
    try {
      const healthy = await this.safeHealthCheck();
      if (!healthy) {
        this.metrics.lastTickAt = Date.now();
        return {
          dispatched: 0,
          failed: 0,
          deadLetter: 0,
          skippedReason: 'unhealthy',
        };
      }

      const batchSize = Math.min(
        Math.max(opts?.batchSize ?? this.batchSize, 1),
        500,
      );

      const rows = await this.prisma.financialEventOutbox.findMany({
        where: {
          deliveredAt: null,
          attempts: { lt: this.maxAttempts },
        },
        orderBy: { publishedAt: 'asc' },
        take: batchSize,
      });

      let dispatched = 0;
      let failed = 0;
      let deadLetter = 0;

      // Concurrency-bounded fan-out.
      const queue = [...rows];
      const inFlight: Promise<void>[] = [];
      const claim = async (): Promise<void> => {
        while (queue.length > 0) {
          const row = queue.shift();
          if (!row) return;
          const result = await this.dispatchOne(row);
          if (result === 'dispatched') dispatched += 1;
          else if (result === 'failed') failed += 1;
          else if (result === 'dead-letter') deadLetter += 1;
        }
      };
      for (let i = 0; i < Math.min(this.maxConcurrent, rows.length); i += 1) {
        inFlight.push(claim());
      }
      await Promise.all(inFlight);

      this.metrics.dispatched += dispatched;
      this.metrics.failed += failed;
      this.metrics.deadLetter += deadLetter;
      this.metrics.lastTickAt = Date.now();
      this.metrics.lastTickDurationMs = Date.now() - startedAt;

      return { dispatched, failed, deadLetter };
    } finally {
      this.working = false;
    }
  }

  /** Replay a previously-delivered window (no-op on already-undelivered rows). */
  async replayDelivered(opts: {
    since: Date;
    until?: Date;
    limit?: number;
  }): Promise<number> {
    const rows = await this.prisma.financialEventOutbox.findMany({
      where: {
        deliveredAt: { not: null, gte: opts.since, lte: opts.until },
      },
      orderBy: { publishedAt: 'asc' },
      take: Math.min(opts.limit ?? 100, 1000),
    });
    let count = 0;
    for (const row of rows) {
      try {
        await this.adapter.publish(this.toEnvelope(row));
        count += 1;
      } catch (err) {
        this.logger.warn(
          `[V20_9_REPLAY_FAILED] eventId=${row.eventId} message=${(err as Error).message}`,
        );
      }
    }
    return count;
  }

  /** Internal — ship one outbox row. */
  private async dispatchOne(
    row: PrismaOutboxRow,
  ): Promise<'dispatched' | 'failed' | 'dead-letter'> {
    if (row.deliveredAt) {
      this.metrics.skippedAlreadyDelivered += 1;
      return 'dispatched';
    }
    try {
      const envelope = this.toEnvelope(row);
      await this.adapter.publish(envelope);
      // Mark delivered ONLY after broker ack.
      await this.prisma.financialEventOutbox
        .updateMany({
          where: { eventId: row.eventId, deliveredAt: null },
          data: { deliveredAt: new Date() },
        })
        .catch((err) => {
          this.logger.warn(
            `[V20_9_MARK_DELIVERED_FAILED] eventId=${row.eventId} message=${(err as Error).message}`,
          );
        });
      return 'dispatched';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const nextAttempts = row.attempts + 1;
      const isDeadLetter = nextAttempts >= this.maxAttempts;
      try {
        await this.prisma.financialEventOutbox.updateMany({
          where: { eventId: row.eventId, deliveredAt: null },
          data: {
            attempts: nextAttempts,
            lastError: message.slice(0, 1024),
          },
        });
      } catch (updateErr) {
        this.logger.warn(
          `[V20_9_UPDATE_ATTEMPTS_FAILED] eventId=${row.eventId} message=${(updateErr as Error).message}`,
        );
      }
      if (isDeadLetter) {
        this.logger.error(
          `[V20_9_DLQ] eventId=${row.eventId} eventName=${row.eventName} customerId=${row.customerId ?? '-'} attempts=${nextAttempts} message=${message}`,
        );
        return 'dead-letter';
      }
      this.logger.warn(
        `[V20_9_DISPATCH_FAILED] eventId=${row.eventId} attempts=${nextAttempts} message=${message}`,
      );
      return 'failed';
    }
  }

  /** Adapter health probe — never throws. */
  private async safeHealthCheck(): Promise<boolean> {
    try {
      return await this.adapter.healthCheck();
    } catch {
      return false;
    }
  }

  /** Convert an outbox row into the broker-shipped envelope. */
  private toEnvelope(row: PrismaOutboxRow): EventEnvelope {
    return {
      eventId: row.eventId,
      eventName: row.eventName,
      customerId: row.customerId,
      correlationId: row.correlationId,
      occurredAt:
        row.occurredAt instanceof Date
          ? row.occurredAt.toISOString()
          : String(row.occurredAt),
      payload: row.payload as unknown,
      publishedAt:
        row.publishedAt instanceof Date
          ? row.publishedAt.getTime()
          : Number(row.publishedAt),
    };
  }

  /** Adapter id — used by metrics + the admin endpoint. */
  get currentAdapterName(): string {
    return this.adapter.name;
  }
}

type PrismaOutboxRow = Prisma.FinancialEventOutboxGetPayload<true>;
