import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DispatchService } from './dispatch.service';

/**
 * SLA monitor cron — ASSIGNED dispatch thresholds (no reassignment).
 *
 * Runs every minute. Stamp-only escalation visibility (`firstAlertAt`,
 * `escalatedAt`, `breachedAt`), SSE `dispatch:alert` to the fixed driver,
 * plus audits / lightweight emitter hooks for dashboards.
 */
@Injectable()
export class DispatchEscalationJob {
  private readonly logger = new Logger(DispatchEscalationJob.name);

  private isRunning = false;

  constructor(private readonly dispatch: DispatchService) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'dispatch.sla' })
  async tick(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    if (this.isRunning) {
      this.logger.debug('dispatch_sla_skipped reason=ALREADY_RUNNING');
      return;
    }
    this.isRunning = true;
    try {
      await this.runOnce();
    } finally {
      this.isRunning = false;
    }
  }

  async runOnce(): Promise<{
    inspected: number;
    firstAlerts: number;
    escalations: number;
    breaches: number;
  }> {
    try {
      const result = await this.dispatch.runSlaMonitorOnce({});
      if (result.inspected > 0 && result.firstAlerts + result.escalations + result.breaches > 0) {
        this.logger.log(
          `dispatch_sla_tick inspected=${result.inspected} firstAlerts=${result.firstAlerts} escalations=${result.escalations} breaches=${result.breaches}`,
        );
      }
      return result;
    } catch (error: unknown) {
      this.logger.error(
        `dispatch_sla_failed reason=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        inspected: 0,
        firstAlerts: 0,
        escalations: 0,
        breaches: 0,
      };
    }
  }
}
