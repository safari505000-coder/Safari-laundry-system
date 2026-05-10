import { Injectable } from '@nestjs/common';
import { FinancialEventDispatcher } from '../financial-event-dispatcher.service';
import { FinancialRealtimeGateway } from '../realtime/financial-realtime.gateway';
import { InMemoryEventBusAdapter } from '../adapters/in-memory-event-bus.adapter';

/**
 * V20.9 — Phase 6 Realtime + Event Bus observability snapshot.
 *
 * Publishes a single `getSnapshot()` API the operations dashboard
 * (`/api/realtime/financial/observability`) consumes. ALL counters
 * are lock-free in-memory — they reset on process restart, by
 * design (the durable audit trail lives in the
 * `FinancialEventOutbox` table).
 *
 * # Metric families
 *
 *   • Bus health         — adapter id + ring-buffer occupancy
 *   • Dispatcher health  — dispatched / failed / dead-letter / last-tick
 *   • Realtime gateway   — active subscribers / fan-out volume / heartbeats
 *
 * # Alert thresholds
 *
 *   See `evaluateAlerts()` — returns a structured list of
 *   `{severity, code, message}` tuples. The Slack/Discord/email
 *   shippers in `common/services/discord-alert.service.ts` already
 *   know how to dispatch this shape, so wiring is one method call.
 */
export type RealtimeAlert = {
  severity: 'WARN' | 'ERROR' | 'CRITICAL';
  code:
    | 'V20_9_DISPATCHER_DLQ_GROWING'
    | 'V20_9_DISPATCHER_FAILURE_RATE_HIGH'
    | 'V20_9_DISPATCHER_STALE_TICK'
    | 'V20_9_REALTIME_NO_SUBSCRIBERS'
    | 'V20_9_REALTIME_FAN_OUT_LAGGING';
  message: string;
};

export type ObservabilitySnapshot = {
  busAdapter: string;
  dispatcher: {
    dispatched: number;
    failed: number;
    deadLetter: number;
    skippedAlreadyDelivered: number;
    lastTickAgoMs: number | null;
    lastTickDurationMs: number;
    failureRatePercent: number;
  };
  realtimeGateway: {
    activeSubscribers: number;
    publishedToFanout: number;
    droppedNoChannel: number;
    heartbeatsSent: number;
  };
  capturedAt: string;
};

@Injectable()
export class RealtimeMetricsService {
  constructor(
    private readonly dispatcher: FinancialEventDispatcher,
    private readonly gateway: FinancialRealtimeGateway,
    private readonly adapter: InMemoryEventBusAdapter,
  ) {}

  getSnapshot(now = new Date()): ObservabilitySnapshot {
    const dm = this.dispatcher.metrics;
    const total = dm.dispatched + dm.failed + dm.deadLetter;
    const failureRate = total > 0 ? ((dm.failed + dm.deadLetter) / total) * 100 : 0;
    return {
      busAdapter: this.dispatcher.currentAdapterName,
      dispatcher: {
        dispatched: dm.dispatched,
        failed: dm.failed,
        deadLetter: dm.deadLetter,
        skippedAlreadyDelivered: dm.skippedAlreadyDelivered,
        lastTickAgoMs:
          dm.lastTickAt === 0 || dm.lastTickAt === null
            ? null
            : now.getTime() - dm.lastTickAt,
        lastTickDurationMs: dm.lastTickDurationMs,
        failureRatePercent: Math.round(failureRate * 100) / 100,
      },
      realtimeGateway: { ...this.gateway.metrics },
      capturedAt: now.toISOString(),
    };
  }

  evaluateAlerts(now = new Date()): RealtimeAlert[] {
    const snap = this.getSnapshot(now);
    const out: RealtimeAlert[] = [];

    if (snap.dispatcher.deadLetter >= 1) {
      out.push({
        severity: snap.dispatcher.deadLetter >= 10 ? 'CRITICAL' : 'ERROR',
        code: 'V20_9_DISPATCHER_DLQ_GROWING',
        message: `Dispatcher DLQ has ${snap.dispatcher.deadLetter} permanently-failed event(s).`,
      });
    }

    if (snap.dispatcher.failureRatePercent >= 25) {
      out.push({
        severity: snap.dispatcher.failureRatePercent >= 50 ? 'CRITICAL' : 'ERROR',
        code: 'V20_9_DISPATCHER_FAILURE_RATE_HIGH',
        message: `Dispatcher failure rate is ${snap.dispatcher.failureRatePercent}%.`,
      });
    }

    if (
      snap.dispatcher.lastTickAgoMs !== null &&
      snap.dispatcher.lastTickAgoMs > 5 * 60 * 1000
    ) {
      out.push({
        severity: 'WARN',
        code: 'V20_9_DISPATCHER_STALE_TICK',
        message: `Dispatcher has not ticked for ${Math.round(snap.dispatcher.lastTickAgoMs / 1000)}s.`,
      });
    }

    if (
      snap.realtimeGateway.publishedToFanout > 100 &&
      snap.realtimeGateway.activeSubscribers === 0
    ) {
      out.push({
        severity: 'WARN',
        code: 'V20_9_REALTIME_NO_SUBSCRIBERS',
        message: 'Realtime fan-out has volume but no active subscribers.',
      });
    }

    if (snap.realtimeGateway.droppedNoChannel >= 50) {
      out.push({
        severity: 'WARN',
        code: 'V20_9_REALTIME_FAN_OUT_LAGGING',
        message: `${snap.realtimeGateway.droppedNoChannel} events fanned out with NO matching channel.`,
      });
    }

    return out;
  }
}
