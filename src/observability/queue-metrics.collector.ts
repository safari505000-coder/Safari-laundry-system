import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import {
  DISCORD_ALERT_DLQ_QUEUE,
  DISCORD_ALERT_QUEUE,
  discordRedisConnection,
} from '../common/services/discord-alert.queue';
import { IntegrationCircuitBreakerService } from '../common/services/integration-circuit-breaker.service';
import { WHATSAPP_DLQ_QUEUE, WHATSAPP_QUEUE } from '../customer-notifications/whatsapp.queue';
import { MetricsService } from './metrics.service';

const QUEUES = [
  { name: 'alerts', queue: DISCORD_ALERT_QUEUE, dlq: DISCORD_ALERT_DLQ_QUEUE, circuit: 'discord' },
  { name: 'whatsapp', queue: WHATSAPP_QUEUE, dlq: WHATSAPP_DLQ_QUEUE, circuit: 'whatsapp' },
] as const;

@Injectable()
export class QueueMetricsCollector {
  private readonly logger = new Logger(QueueMetricsCollector.name);

  constructor(
    private readonly metrics: MetricsService,
    private readonly circuitBreaker: IntegrationCircuitBreakerService,
  ) {}

  @Interval(15_000)
  async collect(): Promise<void> {
    const connection = discordRedisConnection();
    if (!connection) {
      return;
    }
    const started = performance.now();
    let waitingAlerts = 0;
    let waitingWhatsapp = 0;
    for (const config of QUEUES) {
      const queue = new Queue(config.queue, { connection });
      const dlq = new Queue(config.dlq, { connection });
      try {
        const [counts, dlqCounts, circuit] = await Promise.all([
          queue.getJobCounts('active', 'waiting', 'failed', 'completed', 'delayed'),
          dlq.getJobCounts('waiting', 'failed', 'delayed'),
          this.circuitBreaker.state(config.circuit),
        ]);
        if (config.name === 'alerts') {
          waitingAlerts = counts.waiting ?? 0;
        }
        if (config.name === 'whatsapp') {
          waitingWhatsapp = counts.waiting ?? 0;
        }
        for (const state of ['active', 'waiting', 'failed', 'completed', 'delayed'] as const) {
          this.metrics.queueJobs.labels(config.name, state).set(counts[state] ?? 0);
        }
        this.metrics.queueJobsActive.labels(config.name).set(counts.active ?? 0);
        this.metrics.queueJobsWaiting.labels(config.name).set(counts.waiting ?? 0);
        this.metrics.queueJobsFailed.labels(config.name).set(counts.failed ?? 0);
        this.metrics.queueJobsCompleted.labels(config.name).set(counts.completed ?? 0);
        this.metrics.queueJobs
          .labels(`${config.name}_dlq`, 'waiting')
          .set((dlqCounts.waiting ?? 0) + (dlqCounts.failed ?? 0) + (dlqCounts.delayed ?? 0));
        this.metrics.circuitState
          .labels(config.circuit)
          .set(circuit.state === 'OPEN' ? 1 : circuit.state === 'HALF_OPEN' ? 2 : 0);
      } catch (error) {
        this.logger.warn(
          `queue_metrics_failed queue=${config.name} reason=${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      } finally {
        await Promise.all([
          queue.close().catch(() => undefined),
          dlq.close().catch(() => undefined),
        ]);
      }
    }
    const elapsed = performance.now() - started;
    this.metrics.redisLatency.set(elapsed);
    const backlogHigh =
      Number.parseInt(process.env.OPS_QUEUE_BACKLOG_WARN ?? '500', 10) || 500;
    if (waitingAlerts + waitingWhatsapp > backlogHigh) {
      this.logger.warn(
        JSON.stringify({
          event: 'ops_scale_workers_recommended',
          traceId: undefined,
          orderId: undefined,
          waitingAlerts,
          waitingWhatsapp,
          threshold: backlogHigh,
          hint: 'increase_worker_concurrency_or_replicas',
        }),
      );
    }
    const redisSlowMs = Number.parseInt(process.env.OPS_REDIS_LATENCY_WARN_MS ?? '200', 10) || 200;
    if (elapsed > redisSlowMs) {
      this.logger.warn(
        JSON.stringify({
          event: 'ops_redis_latency_high',
          traceId: undefined,
          orderId: undefined,
          latencyMs: elapsed,
          degrade_hint: 'non_critical_queues_may_backpressure',
        }),
      );
    }
    const factor = Number.parseFloat(
      process.env.QUEUE_SLO_SECONDS_PER_WAITING_JOB ?? '0.05',
    );
    const f = Number.isFinite(factor) && factor > 0 ? factor : 0.05;
    this.metrics.setQueueDelayEstimateSeconds((waitingAlerts + waitingWhatsapp) * f);
  }
}
