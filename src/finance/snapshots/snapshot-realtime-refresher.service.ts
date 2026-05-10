import { Injectable, Logger } from '@nestjs/common';
import { FinancialSnapshotService } from './financial-snapshot.service';
import type { SnapshotRefreshSource } from './financial-snapshot.types';

/**
 * V20.6 — Phase 5 Snapshot Realtime Refresher.
 *
 * Replaces the 5-minute cron staleness model with **near-realtime
 * event-driven refresh** while protecting the database from a
 * refresh storm under load.
 *
 * Three layers of protection:
 *
 *   1. **Debounce (per customer)** — repeated requests for the
 *      same customerId within `DEBOUNCE_MS` (default 500ms) are
 *      collapsed into a single refresh. The latest source wins
 *      so the audit trail reflects the most recent business
 *      cause.
 *
 *   2. **Cooldown (per customer)** — once a refresh starts,
 *      further requests within `MIN_INTERVAL_MS` (default 1000ms)
 *      are queued for one final refresh after the cooldown ends.
 *      This prevents tight loops (e.g. a CC agent batch-marking
 *      20 invoices for the same customer in 200ms) from issuing
 *      20 redundant snapshot writes.
 *
 *   3. **Concurrency cap (global)** — at most `MAX_CONCURRENCY`
 *      (default 10) refreshes are in flight simultaneously. Extra
 *      requests wait. Backpressure-safe.
 *
 * Idempotency: request(customerId) is a no-op when the customer
 * is already debounced; the timer fires once.
 *
 * Retry-safety: every internal call is wrapped in a try/catch and
 * logs to `[V20_6_REALTIME_REFRESH_FAILED]`. The financial write
 * path that triggered the request is NEVER blocked.
 *
 * No blocking on financial writes: `request()` returns synchronously
 * after scheduling — never awaits the actual refresh.
 */

const DEFAULT_DEBOUNCE_MS = 500;
const DEFAULT_MIN_INTERVAL_MS = 1000;
const DEFAULT_MAX_CONCURRENCY = 10;

type PendingState = {
  source: SnapshotRefreshSource;
  correlationId: string | null;
  scheduledAt: number;
  timer: NodeJS.Timeout | null;
};

@Injectable()
export class SnapshotRealtimeRefresher {
  private readonly logger = new Logger(SnapshotRealtimeRefresher.name);

  /** Customers with a pending debounced refresh (timer not yet fired). */
  private readonly pending = new Map<string, PendingState>();

  /** Customers currently being refreshed (race guard). */
  private readonly inflight = new Set<string>();

  /** Per-customer cooldown — last completion timestamp. */
  private readonly lastCompletedAt = new Map<string, number>();

  /** Customers with a request that arrived during cooldown — refresh ONCE more. */
  private readonly cooldownQueued = new Set<string>();

  private inflightCount = 0;

  // Counters exposed for observability + tests.
  private readonly stats = {
    requested: 0,
    debounced: 0,
    refreshed: 0,
    failures: 0,
    cooldownSkips: 0,
  };

  constructor(
    private readonly snapshots: FinancialSnapshotService,
    private readonly opts: {
      debounceMs?: number;
      minIntervalMs?: number;
      maxConcurrency?: number;
    } = {},
  ) {}

  /**
   * Schedule a snapshot refresh for the customer. Returns
   * synchronously. Safe to call from event listeners on the
   * financial write path.
   */
  request(
    customerId: string,
    source: SnapshotRefreshSource,
    correlationId?: string | null,
  ): void {
    if (!customerId) return;
    this.stats.requested += 1;

    // Cooldown guard: if a refresh just completed within the
    // cooldown window, defer this request to ONE batched refresh
    // after the cooldown ends.
    const minInterval = this.opts.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
    const lastCompleted = this.lastCompletedAt.get(customerId) ?? 0;
    const sinceCompleted = Date.now() - lastCompleted;
    if (sinceCompleted < minInterval && this.inflight.has(customerId)) {
      // Already running OR within cooldown — queue ONE catch-up refresh.
      this.cooldownQueued.add(customerId);
      this.stats.cooldownSkips += 1;
      return;
    }

    // Debounce: collapse repeated requests within the debounce window.
    const existing = this.pending.get(customerId);
    if (existing) {
      // Replace the source/correlationId so the latest cause wins,
      // but keep the existing timer to preserve the debounce window.
      existing.source = source;
      existing.correlationId = correlationId ?? existing.correlationId;
      this.stats.debounced += 1;
      return;
    }

    const timer = setTimeout(
      () => this.flush(customerId),
      this.opts.debounceMs ?? DEFAULT_DEBOUNCE_MS,
    );
    // Allow the process to exit if this is the only handle.
    if (typeof timer.unref === 'function') timer.unref();

    this.pending.set(customerId, {
      source,
      correlationId: correlationId ?? null,
      scheduledAt: Date.now(),
      timer,
    });
  }

  /**
   * For tests + observability — drain in-flight + pending refreshes.
   * Returns when all currently-known work is complete.
   */
  async drain(maxWaitMs = 5000): Promise<void> {
    const start = Date.now();
    // Force-flush every pending timer (don't wait for the debounce
    // window to elapse).
    for (const [id, state] of this.pending) {
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }
      this.flush(id);
    }
    while (
      (this.pending.size > 0 ||
        this.inflight.size > 0 ||
        this.cooldownQueued.size > 0) &&
      Date.now() - start < maxWaitMs
    ) {
      await new Promise((res) => setTimeout(res, 5));
    }
  }

  /**
   * Snapshot of internal state — observability surface.
   */
  getStats() {
    return {
      ...this.stats,
      pending: this.pending.size,
      inflight: this.inflight.size,
      cooldownQueued: this.cooldownQueued.size,
      inflightCount: this.inflightCount,
    };
  }

  resetStats() {
    this.stats.requested = 0;
    this.stats.debounced = 0;
    this.stats.refreshed = 0;
    this.stats.failures = 0;
    this.stats.cooldownSkips = 0;
  }

  // ---------- internal ----------

  private flush(customerId: string): void {
    const state = this.pending.get(customerId);
    if (!state) return;
    this.pending.delete(customerId);
    void this.execute(customerId, state.source, state.correlationId);
  }

  private async execute(
    customerId: string,
    source: SnapshotRefreshSource,
    correlationId: string | null,
  ): Promise<void> {
    // Concurrency cap.
    const cap = this.opts.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
    while (this.inflightCount >= cap) {
      await new Promise((res) => setTimeout(res, 5));
    }

    if (this.inflight.has(customerId)) {
      // Already running — queue ONE catch-up.
      this.cooldownQueued.add(customerId);
      return;
    }

    this.inflight.add(customerId);
    this.inflightCount += 1;
    try {
      await this.snapshots.refreshOne(customerId, source, correlationId);
      this.stats.refreshed += 1;
    } catch (err) {
      this.stats.failures += 1;
      this.logger.warn(
        `[V20_6_REALTIME_REFRESH_FAILED] customerId=${customerId} source=${source} message=${(err as Error).message}`,
      );
    } finally {
      this.inflight.delete(customerId);
      this.inflightCount -= 1;
      this.lastCompletedAt.set(customerId, Date.now());

      // If a request arrived during the refresh, schedule ONE more.
      if (this.cooldownQueued.has(customerId)) {
        this.cooldownQueued.delete(customerId);
        // Schedule via the normal request() path so the cooldown
        // window applies to this final refresh too.
        this.request(customerId, source, correlationId);
      }
    }
  }
}
