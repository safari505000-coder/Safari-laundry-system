import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OnEvent } from '@nestjs/event-emitter';
import { AuditStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { DiscordAlertService } from '../common/services/discord-alert.service';
import {
  FINANCE_DRIFT_EVENT,
  type FinanceDriftPayload,
} from '../finance/reconciliation/reconciliation.service';
import {
  AccountingHealthService,
  type AccountingHealthReport,
  type AccountingHealthStatus,
} from './accounting-health.service';

/**
 * FINANCIAL HARDENING — automated daily accounting-integrity job + alerting.
 *
 * Closes the "why was it not detected early" half of the root cause:
 *   • Runs a full integrity sweep every day (always-on; only skipped in
 *     tests or when explicitly disabled).
 *   • Persists a `DailyAccountingIntegrityReport` (append-only, auditable).
 *   • Writes an Audit Log entry for every run (suspicious=true on
 *     WARNING/CRITICAL).
 *   • Raises System + Security alerts (Discord) on WARNING/CRITICAL so the
 *     owner is told instead of the drift sitting silent.
 *   • Also listens to the live `finance.drift.detected` event so an
 *     intraday drift alerts immediately, not just at the daily run.
 */
@Injectable()
export class AccountingIntegrityCronService {
  private readonly logger = new Logger(AccountingIntegrityCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly health: AccountingHealthService,
    private readonly audit: AuditLogsService,
    private readonly discord: DiscordAlertService,
  ) {}

  /** Daily at 02:00 server time. Cron string (not enum) for portability. */
  @Cron('0 2 * * *', { name: 'financial_integrity_daily' })
  async scheduledDailyCheck(): Promise<void> {
    if (!this.isEnabled()) {
      this.logger.debug('Daily accounting-integrity check skipped (disabled).');
      return;
    }
    try {
      await this.runDailyCheck();
    } catch (err) {
      this.logger.error(
        `[ACCOUNTING_INTEGRITY_DAILY_FAILED] ${(err as Error).message}`,
      );
    }
  }

  /**
   * Runs the integrity sweep, persists the report, writes an audit log,
   * and raises alerts on WARNING/CRITICAL. Returns the report so the
   * endpoint / tests can assert on it.
   */
  async runDailyCheck(): Promise<AccountingHealthReport> {
    const report = await this.health.computeHealth();
    await this.persistReport(report);
    this.writeAuditLog(report);
    if (report.status !== 'HEALTHY') {
      this.raiseAlerts(report);
    }
    this.logger.log(
      `[ACCOUNTING_INTEGRITY_DAILY] status=${report.status} ` +
        `critical=${report.criticalCount} warning=${report.warningCount} ` +
        `drift=${report.driftCount} durationMs=${report.durationMs}`,
    );
    return report;
  }

  /** Latest persisted report — surfaced in the Owner Command Center. */
  async getLatestReport(): Promise<{
    status: AccountingHealthStatus;
    generatedAt: string;
    criticalCount: number;
    warningCount: number;
    driftCount: number;
  } | null> {
    try {
      const row = await this.prisma.dailyAccountingIntegrityReport.findFirst({
        orderBy: { generatedAt: 'desc' },
        select: {
          status: true,
          generatedAt: true,
          criticalCount: true,
          warningCount: true,
          driftCount: true,
        },
      });
      if (!row) return null;
      return {
        status: row.status as AccountingHealthStatus,
        generatedAt: row.generatedAt.toISOString(),
        criticalCount: row.criticalCount,
        warningCount: row.warningCount,
        driftCount: row.driftCount,
      };
    } catch {
      return null;
    }
  }

  /**
   * Live drift listener. The reconciliation engine emits one of these per
   * failing invariant; we alert immediately + audit so a mid-day drift is
   * never silent. Wrapped so a listener error never breaks the emitter.
   */
  @OnEvent(FINANCE_DRIFT_EVENT, { async: true })
  onDriftDetected(payload: FinanceDriftPayload): void {
    try {
      this.audit.log({
        action: 'ACCOUNTING_DRIFT_DETECTED',
        resource: 'accounting_integrity',
        status: AuditStatus.SUCCESS,
        suspicious: true,
        source: 'reconciliation',
        changes: {
          invariant: payload.invariant,
          expectedKd: payload.expectedKd,
          actualKd: payload.actualKd,
          deltaKd: payload.deltaKd,
          detail: payload.detail,
        },
      });
      this.discord.enqueue(`invariant_${payload.invariant.toLowerCase()}`, {
        message: `Financial drift detected: ${payload.invariant} delta=${payload.deltaKd} KD`,
        invariant: payload.invariant,
        expectedKd: payload.expectedKd,
        actualKd: payload.actualKd,
        deltaKd: payload.deltaKd,
        detail: payload.detail ?? null,
      });
    } catch (err) {
      this.logger.warn(
        `[ACCOUNTING_DRIFT_ALERT_FAILED] ${(err as Error).message}`,
      );
    }
  }

  private isEnabled(): boolean {
    if (process.env.NODE_ENV === 'test') return false;
    const v = (process.env.ACCOUNTING_INTEGRITY_CRON_ENABLED ?? 'true')
      .toString()
      .trim()
      .toLowerCase();
    return v !== 'false' && v !== '0' && v !== 'off' && v !== 'no';
  }

  private async persistReport(report: AccountingHealthReport): Promise<void> {
    try {
      await this.prisma.dailyAccountingIntegrityReport.create({
        data: {
          status: report.status,
          driftCount: report.driftCount,
          criticalCount: report.criticalCount,
          warningCount: report.warningCount,
          checks: report.checks as unknown as object,
          summary: this.summarize(report),
          durationMs: report.durationMs,
        },
      });
    } catch (err) {
      this.logger.error(
        `[ACCOUNTING_INTEGRITY_PERSIST_FAILED] ${(err as Error).message}`,
      );
    }
  }

  private writeAuditLog(report: AccountingHealthReport): void {
    this.audit.log({
      action: 'ACCOUNTING_INTEGRITY_CHECK',
      resource: 'accounting_integrity',
      status: report.status === 'CRITICAL' ? AuditStatus.DENIED : AuditStatus.SUCCESS,
      suspicious: report.status !== 'HEALTHY',
      source: 'daily_reconciliation',
      changes: {
        status: report.status,
        criticalCount: report.criticalCount,
        warningCount: report.warningCount,
        driftCount: report.driftCount,
        failed: report.checks
          .filter((c) => c.status !== 'HEALTHY')
          .map((c) => ({ key: c.key, status: c.status, detail: c.detail })),
      },
    });
  }

  private raiseAlerts(report: AccountingHealthReport): void {
    const failed = report.checks.filter((c) => c.status !== 'HEALTHY');
    const summary = this.summarize(report);
    // `invariant_*` events are classified CRITICAL by the Discord queue;
    // a WARNING uses a non-critical event name.
    const event =
      report.status === 'CRITICAL'
        ? 'invariant_accounting_integrity'
        : 'accounting_integrity_warning';
    try {
      this.discord.enqueue(event, {
        message: summary,
        status: report.status,
        criticalCount: report.criticalCount,
        warningCount: report.warningCount,
        driftCount: report.driftCount,
        failed: failed.map((c) => `${c.label}=${c.metric}`).join(' | '),
      });
    } catch (err) {
      this.logger.warn(
        `[ACCOUNTING_INTEGRITY_ALERT_FAILED] ${(err as Error).message}`,
      );
    }
  }

  private summarize(report: AccountingHealthReport): string {
    const failed = report.checks.filter((c) => c.status !== 'HEALTHY');
    if (failed.length === 0) return 'Accounting integrity HEALTHY — all checks passed.';
    return (
      `Accounting integrity ${report.status}: ` +
      failed.map((c) => `${c.label} [${c.status}] ${c.detail ?? c.metric}`).join('; ')
    );
  }
}
