import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DispatchService } from './dispatch.service';

/**
 * V19.x — Auto-escalation cron for Call-Center dispatches.
 *
 * Runs every minute. For each ASSIGNED dispatch older than the
 * threshold (default 30 minutes — matches the brief), creates a
 * SUCCESSOR dispatch on a different driver. The original is left in
 * ASSIGNED on purpose:
 *   - Order is the only path that closes a dispatch (Single Source
 *     of Truth). Auto-escalation MUST NOT bypass that.
 *   - The original keeps appearing as "LATE / CRITICAL" on the
 *     call-center dashboard until the underlying Order is created
 *     (which can be on EITHER the parent or the successor — the
 *     listener / reconciliation cron picks whichever Order arrived).
 *
 * Idempotency:
 *   - The candidate query filters out parents that already have any
 *     child (`children: { none: {} }`) — re-running the cron one
 *     second later is a guaranteed no-op.
 *   - A single in-process mutex (`isRunning`) prevents overlapping
 *     ticks if the previous run takes longer than the cron interval
 *     (e.g. transient DB latency). Multi-process deployments would
 *     need a distributed lock, but the rest of the codebase already
 *     assumes single-node operation for the in-memory subjects in
 *     `DispatchService.driverStreams`.
 */
@Injectable()
export class DispatchEscalationJob {
  private readonly logger = new Logger(DispatchEscalationJob.name);

  /**
   * Threshold (in minutes) before an ASSIGNED dispatch becomes
   * eligible for ESCALATION. Lifted into a class field so unit
   * tests can override it without monkey-patching the cron
   * decorator. Stays in sync with the brief's "≥30 min → ESCALATE"
   * rule and with the LATE/CRITICAL UI thresholds owned by
   * `severityFor` in DispatchService.
   */
  readonly escalateAfterMinutes = Number.parseInt(
    process.env.DISPATCH_ESCALATE_AFTER_MINUTES ?? '30',
    10,
  );

  private isRunning = false;

  constructor(private readonly dispatch: DispatchService) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'dispatch.escalate' })
  async tick(): Promise<void> {
    if (this.isRunning) {
      this.logger.debug('dispatch_escalation_skipped reason=ALREADY_RUNNING');
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
   * Public entry point that the unit tests + the optional /admin
   * trigger (future) call directly. Returns metrics so callers can
   * surface them on a status page without re-querying the DB.
   */
  async runOnce(): Promise<{
    inspected: number;
    escalated: number;
    skipped: number;
  }> {
    const minAge = Number.isFinite(this.escalateAfterMinutes)
      ? this.escalateAfterMinutes
      : 30;
    try {
      const result = await this.dispatch.runEscalationOnce({
        minAgeMinutes: minAge,
      });
      if (result.inspected > 0) {
        this.logger.log(
          `dispatch_escalation_tick inspected=${result.inspected} escalated=${result.escalated} skipped=${result.skipped} minAgeMinutes=${minAge}`,
        );
      }
      return result;
    } catch (error: unknown) {
      this.logger.error(
        `dispatch_escalation_failed reason=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { inspected: 0, escalated: 0, skipped: 0 };
    }
  }
}
