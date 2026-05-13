import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FinancialSnapshotService } from './financial-snapshot.service';

/**
 * V20.4 — Phase 1 / Phase 4 reconciler.
 *
 * Runs every 5 minutes and refreshes any snapshot row whose
 * `refreshedAt` is older than the configured staleness window
 * OR whose `schemaVersion` is below the current projector. Also
 * backfills customers without a projection row.
 *
 * The cron is intentionally additive — domain-event listeners
 * (`PAYMENT_CAPTURED`, `WALLET_ABSORBED`, `INVOICE_ISSUED`) call
 * `FinancialSnapshotService.refreshOneInBackground` immediately
 * after a write, so the cron exists ONLY as a safety net for:
 *   • events dropped during a process restart;
 *   • out-of-band writes (admin scripts, migrations) that bypass
 *     the event hooks;
 *   • projector schema bumps where every row needs a recompute.
 *
 * Disabled when `FINANCIAL_SNAPSHOT_CRON_DISABLED=true` so a
 * deploy that triggers a noisy first-run can be quieted by ops
 * without a code change.
 */
const STALENESS_WINDOW_MS = 60 * 60 * 1000;
const PAGE_SIZE = 200;

/**
 * Cron اللقطة المالية — يُجدّد اللقطات القديمة كل 5 دقائق
 * 5-minute safety-net cron refreshing stale snapshot rows and backfilling missing ones.
 * Domain-event listeners handle immediate refreshes; this cron catches missed events.
 * Disabled via FINANCIAL_SNAPSHOT_CRON_DISABLED=true.
 * @since V20.4 Phase 1/4
 */
@Injectable()
export class FinancialSnapshotCron {
  private readonly logger = new Logger(FinancialSnapshotCron.name);

  constructor(private readonly snapshots: FinancialSnapshotService) {}

  /**
   * يُشغّل دورة تحديث اللقطات القديمة كل 5 دقائق
   * Runs the stale-snapshot refresh sweep every 5 minutes.
   * Refreshes rows older than 1 hour and backfills missing rows.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcile(): Promise<void> {
    if (this.isDisabled()) return;
    const startedAt = Date.now();
    try {
      const refreshed = await this.snapshots.rebuildStale({
        staleAfter: new Date(Date.now() - STALENESS_WINDOW_MS),
        limit: PAGE_SIZE,
        source: 'CRON_RECONCILE',
      });
      if (refreshed > 0) {
        this.logger.log(
          `[FINANCIAL_SNAPSHOT_CRON] refreshed=${refreshed} elapsedMs=${Date.now() - startedAt}`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[FINANCIAL_SNAPSHOT_CRON_FAILED] message=${message} elapsedMs=${Date.now() - startedAt}`,
      );
    }
  }

  private isDisabled(): boolean {
    const v = (process.env.FINANCIAL_SNAPSHOT_CRON_DISABLED ?? '')
      .toString()
      .trim()
      .toLowerCase();
    return v === 'true' || v === '1' || v === 'on' || v === 'yes';
  }
}
