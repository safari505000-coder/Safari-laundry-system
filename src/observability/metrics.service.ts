import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';

/** Rolling finalize samples for in-process SLO gauges (multi-instance: each pod reports its own window). */
type FinalizeSample = { t: number; ms: number; ok: boolean };

@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  readonly finalizeDuration = new Histogram({
    name: 'payments_finalize_duration_ms',
    help: 'Payment finalization duration in milliseconds',
    buckets: [10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000],
    registers: [this.registry],
  });
  readonly finalizeSuccess = new Counter({
    name: 'payments_finalize_success_total',
    help: 'Successful payment finalizations',
    registers: [this.registry],
  });
  readonly finalizeFailure = new Counter({
    name: 'payments_finalize_failure_total',
    help: 'Failed payment finalizations',
    registers: [this.registry],
  });
  readonly controllerDuration = new Histogram({
    name: 'http_controller_duration_ms',
    help: 'Nest controller request duration in milliseconds',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000],
    registers: [this.registry],
  });
  readonly queueJobs = new Gauge({
    name: 'queue_jobs',
    help: 'BullMQ job counts by queue and state',
    labelNames: ['queue', 'state'] as const,
    registers: [this.registry],
  });
  readonly queueJobsActive = new Gauge({
    name: 'queue_jobs_active',
    help: 'BullMQ active jobs by logical queue name',
    labelNames: ['queue'] as const,
    registers: [this.registry],
  });
  readonly queueJobsWaiting = new Gauge({
    name: 'queue_jobs_waiting',
    help: 'BullMQ waiting jobs by logical queue name',
    labelNames: ['queue'] as const,
    registers: [this.registry],
  });
  readonly queueJobsFailed = new Gauge({
    name: 'queue_jobs_failed',
    help: 'BullMQ failed jobs by logical queue name',
    labelNames: ['queue'] as const,
    registers: [this.registry],
  });
  readonly queueJobsCompleted = new Gauge({
    name: 'queue_jobs_completed',
    help: 'BullMQ completed jobs by logical queue name',
    labelNames: ['queue'] as const,
    registers: [this.registry],
  });
  readonly circuitState = new Gauge({
    name: 'circuit_state',
    help: 'Circuit breaker state: 0=closed, 1=open, 2=half_open',
    labelNames: ['service'] as const,
    registers: [this.registry],
  });
  readonly redisLatency = new Gauge({
    name: 'redis_latency_ms',
    help: 'Observed Redis latency in milliseconds',
    registers: [this.registry],
  });
  readonly dbQueryDuration = new Histogram({
    name: 'db_query_duration_ms',
    help: 'Observed database query duration in milliseconds',
    buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1_000],
    registers: [this.registry],
  });
  readonly sloPaymentSuccessRatio = new Gauge({
    name: 'slo_payment_success_ratio',
    help: 'Rolling payment finalize success ratio (target 0.999)',
    registers: [this.registry],
  });
  readonly sloLatencyP95 = new Gauge({
    name: 'slo_latency_p95',
    help: 'Rolling P95 payment finalize latency in ms (SLO < 200ms)',
    registers: [this.registry],
  });
  readonly sloErrorBudgetRemaining = new Gauge({
    name: 'slo_payment_error_budget_remaining_ratio',
    help: 'Remaining error budget vs target over rolling 5m window (0-1)',
    registers: [this.registry],
  });
  readonly paymentsPerMinute = new Gauge({
    name: 'payments_per_minute',
    help: 'Finalize attempts observed in the last 60s on this instance',
    registers: [this.registry],
  });
  readonly paymentFailureRate = new Gauge({
    name: 'payment_failure_rate',
    help: 'Rolling finalize failure ratio on this instance (0-1)',
    registers: [this.registry],
  });
  readonly revenueTotal = new Gauge({
    name: 'revenue_total',
    help: 'Settled order revenue snapshot (KWD) from DB aggregate (async collector)',
    registers: [this.registry],
  });
  readonly queueDelayEstimate = new Gauge({
    name: 'slo_queue_delay_estimate_s',
    help: 'Heuristic queue lag estimate from backlog (see runbooks)',
    registers: [this.registry],
  });

  private readonly finalizeSamples: FinalizeSample[] = [];
  private static readonly SAMPLE_MAX_AGE_MS = 5 * 60_000;
  private static readonly SAMPLE_CAP = 10_000;

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }

  recordFinalize(durationMs: number, ok: boolean): void {
    this.finalizeDuration.observe(durationMs);
    if (ok) {
      this.finalizeSuccess.inc();
    } else {
      this.finalizeFailure.inc();
    }
    const now = Date.now();
    this.finalizeSamples.push({ t: now, ms: durationMs, ok });
    if (this.finalizeSamples.length > MetricsService.SAMPLE_CAP) {
      this.finalizeSamples.splice(
        0,
        this.finalizeSamples.length - MetricsService.SAMPLE_CAP,
      );
    }
    this.trimSamples(now);
  }

  setRevenueTotalKd(value: number): void {
    if (Number.isFinite(value) && value >= 0) {
      this.revenueTotal.set(value);
    }
  }

  setQueueDelayEstimateSeconds(value: number): void {
    if (Number.isFinite(value) && value >= 0) {
      this.queueDelayEstimate.set(value);
    }
  }

  paymentSnapshot(): {
    successRate: number;
    successCount: number;
    failureCount: number;
  } {
    const now = Date.now();
    this.trimSamples(now);
    const win = this.finalizeSamples.filter(
      (s) => now - s.t < MetricsService.SAMPLE_MAX_AGE_MS,
    );
    const successCount = win.filter((s) => s.ok).length;
    const failureCount = win.length - successCount;
    const successRate =
      win.length > 0 ? Math.round((successCount / win.length) * 10_000) / 100 : 100;
    return { successRate, successCount, failureCount };
  }

  @Interval(10_000)
  refreshDerivedSloGauges(): void {
    const now = Date.now();
    this.trimSamples(now);
    const win = this.finalizeSamples.filter(
      (s) => now - s.t < MetricsService.SAMPLE_MAX_AGE_MS,
    );
    const n = win.length;
    if (n === 0) {
      this.sloPaymentSuccessRatio.set(1);
      this.sloLatencyP95.set(0);
      this.paymentFailureRate.set(0);
      this.sloErrorBudgetRemaining.set(1);
      this.paymentsPerMinute.set(0);
      return;
    }
    const okc = win.filter((s) => s.ok).length;
    const fc = n - okc;
    const ratio = okc / n;
    this.sloPaymentSuccessRatio.set(ratio);
    this.paymentFailureRate.set(fc / n);
    const sortedMs = win.map((s) => s.ms).sort((a, b) => a - b);
    const idx = Math.max(0, Math.ceil(sortedMs.length * 0.95) - 1);
    this.sloLatencyP95.set(sortedMs[idx] ?? 0);
    const target = Number.parseFloat(process.env.PAYMENT_SLO_TARGET ?? '0.999');
    const safeTarget = Number.isFinite(target) && target > 0 && target < 1 ? target : 0.999;
    const allowed = (1 - safeTarget) * n;
    const budgetRem =
      allowed > 0 ? Math.max(0, allowed - fc) / allowed : 1;
    this.sloErrorBudgetRemaining.set(Math.min(1, budgetRem));
    const oneMin = win.filter((s) => now - s.t < 60_000).length;
    this.paymentsPerMinute.set(oneMin);
  }

  private trimSamples(now: number): void {
    const cutoff = now - MetricsService.SAMPLE_MAX_AGE_MS;
    while (this.finalizeSamples.length > 0 && this.finalizeSamples[0].t < cutoff) {
      this.finalizeSamples.shift();
    }
  }

  async prometheus(): Promise<string> {
    return this.registry.metrics();
  }
}
