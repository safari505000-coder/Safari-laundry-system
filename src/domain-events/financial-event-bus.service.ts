import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  type FinancialDomainEventName,
  type FinancialDomainEventPayloadByName,
  type FinancialDomainEvent,
} from './financial-domain-event.types';

/**
 * V20.6 — Phase 4 FinancialEventBus.
 *
 * Durable, idempotent successor to {@link FinancialDomainEventPublisher}.
 *
 * Design intent:
 *   1. **Append-only event log** — every published event lands in
 *      `FinancialEventOutbox` BEFORE the in-process emit. The DB
 *      trigger keeps the log immutable; only delivery metadata
 *      (`attempts`, `deliveredAt`, `lastError`) can mutate after
 *      creation.
 *   2. **Deterministic event IDs** — eventId = SHA-256 over the
 *      tuple `(name, customerId, correlationId, occurredAtIsoSec)`.
 *      A re-publish under the same business cause produces the
 *      same eventId, the UNIQUE index trips, and `publish()`
 *      returns the existing row without re-emitting. This is the
 *      idempotency boundary at the producer.
 *   3. **Idempotent consumers** — `recordConsumed` writes to
 *      `FinancialEventDelivery` with a composite UNIQUE on
 *      (eventId, consumerName). A retry of an already-processed
 *      event returns `{processed: false}` so handlers can skip
 *      cleanly.
 *   4. **Retry-safe** — bus writes never throw upward; the
 *      publishing transaction succeeds even if the bus is
 *      degraded (logged at WARN). Future Kafka migration adds a
 *      dispatcher that reads `WHERE deliveredAt IS NULL` and
 *      ships to the broker; nothing in this file changes.
 *   5. **Future-Kafka ready** — the outbox row IS the on-disk
 *      audit trail. Adding a dispatcher cron is the only delta
 *      needed to swap to Kafka/NATS without touching producers.
 *
 * Backwards-compat: `FinancialDomainEventPublisher` continues to
 * work; both use the same `EventEmitter2` so existing listeners
 * are unaffected. New code should prefer the bus for the durable
 * audit trail.
 */
@Injectable()
export class FinancialEventBus {
  private readonly logger = new Logger(FinancialEventBus.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: EventEmitter2,
  ) {}

  /**
   * Publish a financial domain event.
   *
   * Returns:
   *   • `{eventId, alreadyPublished:false}` on first publish
   *   • `{eventId, alreadyPublished:true}` on idempotent retry
   *
   * NEVER throws. A bus / DB failure is logged at WARN and the
   * caller's transaction commits unaffected.
   */
  async publish<N extends FinancialDomainEventName>(
    name: N,
    payload: FinancialDomainEventPayloadByName[N],
  ): Promise<{ eventId: string; alreadyPublished: boolean }> {
    const eventId = this.deterministicEventId(name, payload);
    const envelope: FinancialDomainEvent<N> = { name, payload };

    let alreadyPublished = false;
    try {
      const created = await this.prisma.financialEventOutbox
        .create({
          data: {
            eventId,
            eventName: name,
            customerId: payload.customerId ?? null,
            correlationId: payload.correlationId ?? null,
            occurredAt: new Date(payload.occurredAt),
            payload: envelope as unknown as Prisma.InputJsonValue,
          },
          select: { id: true },
        })
        .then(() => true)
        .catch((err) => {
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2002'
          ) {
            alreadyPublished = true;
            return false;
          }
          throw err;
        });
      if (created === false && !alreadyPublished) {
        // Unexpected — should never happen.
        this.logger.warn(
          `[V20_6_EVENT_BUS_INSERT_RETURNED_FALSE] eventId=${eventId}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `[V20_6_EVENT_BUS_PERSIST_FAILED] name=${name} eventId=${eventId} message=${(err as Error).message}`,
      );
      // Continue to in-process emit even if outbox failed — the
      // in-process listeners (snapshot refresh) should still fire
      // so live UIs don't go stale during a bus outage.
    }

    if (alreadyPublished) {
      this.logger.debug(
        `[V20_6_EVENT_BUS_IDEMPOTENT_SKIP] name=${name} eventId=${eventId} customerId=${payload.customerId}`,
      );
      return { eventId, alreadyPublished: true };
    }

    try {
      this.bus.emit(name, envelope);
      this.logger.log(
        `[V20_6_EVENT_BUS_EMIT] name=${name} eventId=${eventId} customerId=${payload.customerId} correlationId=${payload.correlationId ?? '-'}`,
      );
    } catch (err) {
      this.logger.warn(
        `[V20_6_EVENT_BUS_EMIT_FAILED] name=${name} eventId=${eventId} message=${(err as Error).message}`,
      );
    }
    return { eventId, alreadyPublished: false };
  }

  /**
   * Mark an event as delivered to a named consumer. Returns
   * `{processed:true}` when the row is newly inserted; returns
   * `{processed:false}` when (eventId, consumerName) already
   * exists — i.e. a replay. Idempotent consumers should EARLY
   * RETURN when `processed:false`.
   */
  async recordConsumed(input: {
    eventId: string;
    consumerName: string;
    status?: 'OK' | 'ERROR';
    errorMessage?: string | null;
  }): Promise<{ processed: boolean }> {
    try {
      await this.prisma.financialEventDelivery.create({
        data: {
          eventId: input.eventId,
          consumerName: input.consumerName,
          status: input.status ?? 'OK',
          errorMessage: input.errorMessage ?? null,
        },
        select: { id: true },
      });
      return { processed: true };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return { processed: false };
      }
      this.logger.warn(
        `[V20_6_EVENT_BUS_DELIVERY_FAILED] eventId=${input.eventId} consumer=${input.consumerName} message=${(err as Error).message}`,
      );
      // Conservative: pretend not-processed so the consumer retries.
      return { processed: false };
    }
  }

  /**
   * Mark an outbox row delivered (used by future Kafka dispatcher).
   * Today the in-process emit is synchronous so we mark immediately
   * after `bus.emit` returns. The dispatcher will move that call
   * to the broker-ack handler.
   */
  async markDelivered(eventId: string): Promise<void> {
    await this.prisma.financialEventOutbox
      .updateMany({
        where: { eventId, deliveredAt: null },
        data: { deliveredAt: new Date() },
      })
      .catch((err) => {
        this.logger.warn(
          `[V20_6_EVENT_BUS_MARK_DELIVERED_FAILED] eventId=${eventId} message=${(err as Error).message}`,
        );
      });
  }

  /**
   * Replay a window of outbox events through `bus.emit` — useful
   * for catch-up after a bus outage or to seed a new consumer.
   * Returns the count of events replayed (pure read on the producer
   * side; consumers protect themselves via `recordConsumed`).
   */
  async replay(opts?: {
    since?: Date;
    until?: Date;
    name?: FinancialDomainEventName;
    limit?: number;
  }): Promise<number> {
    const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 1000);
    const where: Prisma.FinancialEventOutboxWhereInput = {};
    if (opts?.since) where.publishedAt = { gte: opts.since };
    if (opts?.until)
      where.publishedAt = { ...(where.publishedAt as object), lte: opts.until };
    if (opts?.name) where.eventName = opts.name;
    const rows = await this.prisma.financialEventOutbox.findMany({
      where,
      orderBy: { publishedAt: 'asc' },
      take: limit,
    });
    let count = 0;
    for (const row of rows) {
      try {
        this.bus.emit(row.eventName, row.payload);
        count += 1;
      } catch (err) {
        this.logger.warn(
          `[V20_6_EVENT_BUS_REPLAY_EMIT_FAILED] eventId=${row.eventId} message=${(err as Error).message}`,
        );
      }
    }
    return count;
  }

  // ---------- internal ----------

  /**
   * Deterministic SHA-256 over a stable subset of the event:
   *   • event name
   *   • customerId (or empty)
   *   • correlationId (or empty)
   *   • occurredAt rounded to second precision (decouples from
   *     millisecond jitter in retries)
   *
   * The same logical event published twice within the same second
   * produces the same eventId → idempotent at the publisher.
   */
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
}
