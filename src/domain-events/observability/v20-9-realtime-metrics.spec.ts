import { FinancialEventDispatcher } from '../financial-event-dispatcher.service';
import { FinancialRealtimeGateway } from '../realtime/financial-realtime.gateway';
import { InMemoryEventBusAdapter } from '../adapters/in-memory-event-bus.adapter';
import { RealtimeMetricsService } from './realtime-metrics.service';

/**
 * V20.9 — Phase 6 observability + alerting contracts.
 *
 *   1. Snapshot rolls up dispatcher + gateway counters.
 *   2. DLQ alert fires at 1+ dead-letter, escalates at 10+.
 *   3. Failure-rate alert fires at >= 25% (ERROR), >= 50% (CRITICAL).
 *   4. Stale-tick alert fires when no tick in 5+ min.
 *   5. Healthy state returns NO alerts.
 */
describe('V20.9 — REALTIME METRICS', () => {
  function build() {
    const adapter = new InMemoryEventBusAdapter();
    const gateway = new FinancialRealtimeGateway();
    const fakePrisma = {
      financialEventOutbox: {
        findMany: () => Promise.resolve([]),
        updateMany: () => Promise.resolve({ count: 0 }),
      },
    } as any;
    const dispatcher = new FinancialEventDispatcher(fakePrisma, adapter, adapter);
    const metrics = new RealtimeMetricsService(dispatcher, gateway, adapter);
    return { adapter, gateway, dispatcher, metrics };
  }

  it('1. snapshot rolls up dispatcher + gateway counters', () => {
    const { dispatcher, gateway, metrics } = build();
    dispatcher.metrics.dispatched = 10;
    dispatcher.metrics.failed = 2;
    dispatcher.metrics.deadLetter = 0;
    gateway.metrics.publishedToFanout = 7;
    gateway.metrics.activeSubscribers = 3;

    const snap = metrics.getSnapshot(new Date('2026-05-07T12:00:00Z'));
    expect(snap.busAdapter).toBe('in-memory');
    expect(snap.dispatcher.dispatched).toBe(10);
    expect(snap.dispatcher.failureRatePercent).toBeCloseTo(16.67, 1);
    expect(snap.realtimeGateway.publishedToFanout).toBe(7);
    expect(snap.realtimeGateway.activeSubscribers).toBe(3);
  });

  it('2. DLQ alert fires at 1+, escalates to CRITICAL at 10+', () => {
    const { dispatcher, metrics } = build();
    dispatcher.metrics.deadLetter = 3;
    let alerts = metrics.evaluateAlerts();
    const dlq3 = alerts.find((a) => a.code === 'V20_9_DISPATCHER_DLQ_GROWING');
    expect(dlq3?.severity).toBe('ERROR');

    dispatcher.metrics.deadLetter = 12;
    alerts = metrics.evaluateAlerts();
    const dlq12 = alerts.find((a) => a.code === 'V20_9_DISPATCHER_DLQ_GROWING');
    expect(dlq12?.severity).toBe('CRITICAL');
  });

  it('3. failure-rate alert at >=25% / CRITICAL at >=50%', () => {
    const { dispatcher, metrics } = build();
    dispatcher.metrics.dispatched = 6;
    dispatcher.metrics.failed = 4; // 40%
    let alerts = metrics.evaluateAlerts();
    const a40 = alerts.find((a) => a.code === 'V20_9_DISPATCHER_FAILURE_RATE_HIGH');
    expect(a40?.severity).toBe('ERROR');

    dispatcher.metrics.dispatched = 4;
    dispatcher.metrics.failed = 6; // 60%
    alerts = metrics.evaluateAlerts();
    const a60 = alerts.find((a) => a.code === 'V20_9_DISPATCHER_FAILURE_RATE_HIGH');
    expect(a60?.severity).toBe('CRITICAL');
  });

  it('4. stale-tick alert when no tick in 5+ min', () => {
    const { dispatcher, metrics } = build();
    dispatcher.metrics.lastTickAt = Date.now() - 6 * 60 * 1000;
    const alerts = metrics.evaluateAlerts(new Date());
    expect(alerts.some((a) => a.code === 'V20_9_DISPATCHER_STALE_TICK')).toBe(true);
  });

  it('5. healthy state returns NO alerts', () => {
    const { metrics } = build();
    const alerts = metrics.evaluateAlerts();
    expect(alerts).toEqual([]);
  });

  it('6. no-subscribers warning fires when fan-out has volume but 0 listeners', () => {
    const { gateway, metrics } = build();
    gateway.metrics.publishedToFanout = 200;
    gateway.metrics.activeSubscribers = 0;
    const alerts = metrics.evaluateAlerts();
    expect(alerts.some((a) => a.code === 'V20_9_REALTIME_NO_SUBSCRIBERS')).toBe(true);
  });
});
