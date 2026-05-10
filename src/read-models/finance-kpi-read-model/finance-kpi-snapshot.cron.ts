import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FinanceKpiReadModel } from './finance-kpi-read-model.service';

/**
 * V20.4 — Phase 4 KPI refresher.
 *
 * Runs every 5 minutes and rebuilds every materialised KPI
 * scope. Disabled via `FINANCE_KPI_CRON_DISABLED=true` so a
 * deploy can quiet the first-run noise without a code change.
 *
 * Domain-event-driven incremental refresh ships in V20.4.x;
 * the cron is the always-on baseline.
 */
@Injectable()
export class FinanceKpiSnapshotCron {
  private readonly logger = new Logger(FinanceKpiSnapshotCron.name);

  constructor(private readonly kpis: FinanceKpiReadModel) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async refresh(): Promise<void> {
    if (this.isDisabled()) return;
    const startedAt = Date.now();
    try {
      const { refreshed, failed } = await this.kpis.refreshAll();
      this.logger.log(
        `[FINANCE_KPI_CRON] refreshed=${refreshed} failed=${failed} elapsedMs=${Date.now() - startedAt}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[FINANCE_KPI_CRON_FAILED] message=${message} elapsedMs=${Date.now() - startedAt}`,
      );
    }
  }

  private isDisabled(): boolean {
    const v = (process.env.FINANCE_KPI_CRON_DISABLED ?? '')
      .toString()
      .trim()
      .toLowerCase();
    return v === 'true' || v === '1' || v === 'on' || v === 'yes';
  }
}
