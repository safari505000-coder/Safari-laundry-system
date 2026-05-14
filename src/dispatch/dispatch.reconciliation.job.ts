import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DispatchService } from './dispatch.service';

/**
 * V19.x — Reconciliation cron for Call-Center dispatches.
 *
 * Runs every 2 minutes (the cron expression "0 slash-2 * * * *" is
 * spelled out literally to avoid embedding a comment terminator).
 * Closes ASSIGNED dispatches that ALREADY have a matching Order in
 * the DB but whose
 * `handleOrderCreated` event listener never fired (lost EventEmitter
 * event, process restart in the middle of the listener body,
 * pre-V19.x dispatches that exist before the listener was deployed,
 * etc.).
 *
 * This is the SAFETY NET that lets us guarantee "Order = truth" even
 * when the in-process pub/sub layer drops a message — the DB itself
 * is still the source of truth and the cron walks it.
 *
 * STRICT contract:
 *   - Only updates rows WHERE status = ASSIGNED (same predicate as
 *     the listener) so the two paths cannot double-stamp.
 *   - Stamps `completedByOrderId = oldestMatchingOrder.id` to keep
 *     deterministic attribution (the FIRST order linked to the
 *     dispatch wins, matching the listener's behaviour for
 *     concurrent invoice creates).
 *   - Writes `DISPATCH_RECONCILED` audit row only when the update
 *     actually flipped a row — re-running the cron is silent.
 */
@Injectable()
export class DispatchReconciliationJob {
  private readonly logger = new Logger(DispatchReconciliationJob.name);

  private isRunning = false;

  constructor(private readonly dispatch: DispatchService) {}

  /**
   * Cron expression: "0 slash-2 * * * *" — at second :00 of every
   * 2nd minute. `@nestjs/schedule` does not ship a named
   * EVERY_2_MINUTES constant, so the expression is inlined inside
   * the decorator below. The first field (seconds) is set to `0`
   * so reconciliation never overlaps the minute-boundary tick of
   * the escalation job.
   */
  @Cron('0 */2 * * * *', { name: 'dispatch.reconcile' })
  async tick(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    if (this.isRunning) {
      this.logger.debug(
        'dispatch_reconciliation_skipped reason=ALREADY_RUNNING',
      );
      return;
    }
    this.isRunning = true;
    try {
      await this.runOnce();
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Public entry point. Returns metrics so unit tests can assert
   * exact close counts without re-querying.
   */
  async runOnce(): Promise<{ inspected: number; closed: number }> {
    try {
      const result = await this.dispatch.runReconciliationOnce();
      if (result.inspected > 0) {
        this.logger.log(
          `dispatch_reconciliation_tick inspected=${result.inspected} closed=${result.closed}`,
        );
      }
      return result;
    } catch (error: unknown) {
      this.logger.error(
        `dispatch_reconciliation_failed reason=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { inspected: 0, closed: 0 };
    }
  }
}
