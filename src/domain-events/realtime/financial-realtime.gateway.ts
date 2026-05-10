import {
  Injectable,
  Logger,
  type MessageEvent,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Observable, Subject, interval, merge } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import {
  channelById,
  channelsForEvent,
  isRoleAllowed,
  REALTIME_HEARTBEAT_MS,
  type RealtimeChannelId,
  type RealtimeFanoutEnvelope,
  type RealtimeRole,
} from './financial-realtime.types';
import type { FinancialDomainEvent } from '../financial-domain-event.types';

/**
 * V20.9 — Phase 2 Realtime Gateway.
 *
 * Listens on every `finance.*` event published through the V20.6
 * {@link FinancialEventBus} and re-publishes them on per-channel
 * SSE feeds the frontend can subscribe to.
 *
 * # Why SSE, not WebSocket
 *
 * The system already runs SSE in production (driver dispatch +
 * control tower). SSE matches V20.9's needs perfectly:
 *
 *   • Server → client push (the only direction we need; clients
 *     issue mutations via HTTP, not over the realtime channel).
 *   • Native browser auto-reconnect with `Last-Event-ID`.
 *   • Plain HTTP — works through every load balancer + reverse
 *     proxy without a separate WS upgrade path.
 *   • JWT auth via `?access_token=` (already supported by the
 *     existing auth pipeline).
 *
 * If a future deployment needs WebSockets (e.g. for client→server
 * push or binary frames) the contract in `financial-realtime.types`
 * is transport-neutral — wrap it in a Nest `WebSocketGateway` and
 * fan out the same `RealtimeFanoutEnvelope`.
 *
 * # Backpressure + memory
 *
 * Each subscriber gets its OWN observable — RxJS handles
 * backpressure per-subscriber. The gateway maintains a single
 * shared `Subject<>` so the fan-out is O(1) regardless of
 * subscriber count.
 *
 * # Authorization
 *
 * The controller (NOT this service) checks the JWT and the role
 * gate via `isRoleAllowed(role, channel)`. This service is
 * deliberately auth-naive — it can be unit-tested in isolation
 * and re-used by future test harnesses.
 */
@Injectable()
export class FinancialRealtimeGateway {
  private readonly logger = new Logger(FinancialRealtimeGateway.name);
  private readonly fanout = new Subject<RealtimeFanoutEnvelope>();

  /** Counters surfaced in the V20.9 observability layer. */
  readonly metrics = {
    publishedToFanout: 0,
    droppedNoChannel: 0,
    activeSubscribers: 0,
    heartbeatsSent: 0,
  };

  /**
   * Subscribe to the fan-out as a per-channel SSE-shaped feed.
   * The controller maps this to `Observable<MessageEvent>`.
   *
   * `customerScope` is OPTIONAL — when provided, only events with
   * the same `customerId` flow through (used by per-customer
   * Customer 360 subscriptions).
   */
  subscribe(opts: {
    channel: RealtimeChannelId;
    role: RealtimeRole | string;
    customerScope?: string | null;
    branchScope?: string | null;
  }): Observable<MessageEvent> {
    const channel = channelById(opts.channel);
    if (!channel) {
      throw new Error(
        `[V20_9_REALTIME_UNKNOWN_CHANNEL] channel=${opts.channel}`,
      );
    }
    if (!isRoleAllowed(opts.role, channel)) {
      throw new Error(
        `[V20_9_REALTIME_FORBIDDEN] role=${opts.role} channel=${opts.channel}`,
      );
    }

    this.metrics.activeSubscribers += 1;

    const heartbeat$ = interval(REALTIME_HEARTBEAT_MS).pipe(
      map<number, MessageEvent>(() => {
        this.metrics.heartbeatsSent += 1;
        return {
          type: 'heartbeat',
          data: JSON.stringify({ at: new Date().toISOString() }),
        };
      }),
    );

    const events$ = this.fanout.pipe(
      filter((env) => env.channel === opts.channel),
      filter((env) =>
        opts.customerScope
          ? env.customerId === opts.customerScope
          : true,
      ),
      filter((env) =>
        opts.branchScope
          ? env.branchId === opts.branchScope || env.branchId === null
          : true,
      ),
      map<RealtimeFanoutEnvelope, MessageEvent>((env) => ({
        type: 'finance:event',
        // SSE ID lets the browser auto-reconnect with Last-Event-ID
        // and skip events it has already seen.
        id: env.eventName + ':' + env.at,
        data: JSON.stringify(env),
      })),
    );

    return new Observable<MessageEvent>((subscriber) => {
      const sub = merge(events$, heartbeat$).subscribe(subscriber);
      return () => {
        sub.unsubscribe();
        this.metrics.activeSubscribers = Math.max(
          0,
          this.metrics.activeSubscribers - 1,
        );
      };
    });
  }

  /**
   * Wildcard listener — every `finance.*` event the V20.6 bus
   * emits lands here. The gateway routes it to the matching
   * channels (zero, one, or several).
   */
  @OnEvent('finance.**', { async: true })
  onFinancialEvent(event: FinancialDomainEvent): void {
    if (!event || typeof event !== 'object' || !('name' in event)) return;
    const matches = channelsForEvent(event);
    if (matches.length === 0) {
      this.metrics.droppedNoChannel += 1;
      return;
    }
    const customerId =
      ((event.payload as { customerId?: string }).customerId ?? null) || null;
    const branchId =
      ((event.payload as { branchId?: string }).branchId ?? null) || null;
    const at = new Date().toISOString();
    for (const channel of matches) {
      const envelope: RealtimeFanoutEnvelope = {
        channel: channel.id,
        eventName: event.name,
        customerId,
        branchId,
        at,
        payload: event.payload,
      };
      this.fanout.next(envelope);
      this.metrics.publishedToFanout += 1;
    }
  }
}
