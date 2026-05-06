import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OutstandingService } from './outstanding.service';

/**
 * V19.x — Daily AR snapshot cron.
 *
 * Runs at 06:00 UTC (≈ 09:00 Asia/Kuwait). Pulls the same aggregated
 * report the call-centre sees and logs a one-line summary. NEVER:
 * - mutates customer state
 * - writes to `CustomerCollectionStatus`
 * - sends WhatsApp / SMS / push notifications
 * - blocks/unblocks customers
 *
 * Intentionally informational only so the night-shift can see whether
 * the AR queue is stable, with zero risk of cron-driven side-effects.
 */
export type OutstandingSnapshotResult = {
  ranAtIso: string;
  fromIso: string;
  toIso: string;
  totalCustomers: number;
  totalInvoices: number;
  totalDueKd: string;
  blockedCount: number;
  lateCount: number;
  riskCount: number;
  error?: string;
};

@Injectable()
export class OutstandingSnapshotCron {
  private readonly logger = new Logger(OutstandingSnapshotCron.name);
  private isRunning = false;
  private lastResult: OutstandingSnapshotResult | null = null;

  constructor(private readonly outstanding: OutstandingService) {}

  @Cron('0 6 * * *', {
    name: 'finance.outstanding.snapshot',
    timeZone: 'UTC',
  })
  async tick(): Promise<void> {
    if (this.isRunning) {
      this.logger.debug('outstanding_snapshot_skipped reason=ALREADY_RUNNING');
      return;
    }
    this.isRunning = true;
    try {
      this.lastResult = await this.runOnce();
    } finally {
      this.isRunning = false;
    }
  }

  async runOnce(): Promise<OutstandingSnapshotResult> {
    try {
      const data = await this.outstanding.listOutstanding({});
      const result: OutstandingSnapshotResult = {
        ranAtIso: new Date().toISOString(),
        fromIso: data.fromIso,
        toIso: data.toIso,
        totalCustomers: data.totalCustomers,
        totalInvoices: data.totalInvoices,
        totalDueKd: data.totalDueKd,
        blockedCount: data.blockedCount,
        lateCount: data.lateCount,
        riskCount: data.riskCount,
      };
      this.logger.log(
        `outstanding_snapshot customers=${result.totalCustomers} invoices=${
          result.totalInvoices
        } dueKd=${result.totalDueKd} blocked=${
          result.blockedCount
        } late=${result.lateCount} risk=${result.riskCount}`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `outstanding_snapshot_failed reason=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        ranAtIso: new Date().toISOString(),
        fromIso: '',
        toIso: '',
        totalCustomers: 0,
        totalInvoices: 0,
        totalDueKd: '0.000',
        blockedCount: 0,
        lateCount: 0,
        riskCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  getLastResult(): OutstandingSnapshotResult | null {
    return this.lastResult;
  }
}
