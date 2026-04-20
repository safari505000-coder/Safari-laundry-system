import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';
import { Prisma } from '@prisma/client';
import { KUWAIT_TIMEZONE } from '../common/time/kuwait-time';
import { PrismaService } from '../prisma/prisma.service';
import { CallCenterService } from './call-center.service';

/**
 * V19.5 — Daily reconciliation guard for Call-Center collections.
 *
 * Runs at Kuwait 23:59 — one minute before the day rolls over — so the
 * whole collection window (00:00 → 23:59) is aggregated against both
 * sources of truth (TransactionHistory and GeneralLedgerEntry) while
 * the numbers are still fresh in the agents' heads. Any DRIFT is
 * escalated twice:
 *
 *   1. `AuditLog` row (resource=`/call-center/reconciliation`, action
 *      `RECONCILIATION_DRIFT` or `RECONCILIATION_CLEAN`) so the owner
 *      dashboard can render "last checked at 23:59 — ✓ matched / ⚠ drift".
 *      A clean run is still logged so the UI can prove the job is alive.
 *   2. `Sentry.captureMessage(...)` with `level=warning` when DRIFT so
 *      ops get paged — matches the convention used by global-exception.
 */
const AUDIT_RESOURCE = '/call-center/reconciliation';
const AUDIT_ACTION_CLEAN = 'RECONCILIATION_CLEAN';
const AUDIT_ACTION_DRIFT = 'RECONCILIATION_DRIFT';

@Injectable()
export class DailyCollectionsReconciliationCronService {
  private readonly logger = new Logger(
    DailyCollectionsReconciliationCronService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly callCenter: CallCenterService,
  ) {}

  @Cron('59 23 * * *', {
    name: 'cc-daily-reconciliation',
    timeZone: KUWAIT_TIMEZONE,
  })
  async handleCron(): Promise<void> {
    try {
      // No `date` query param → service defaults to "today" in Asia/Kuwait,
      // which is exactly the window we want at 23:59 local.
      const report = await this.callCenter.getDailyCollectionsReconciliation({});

      await this.prisma.auditLog.create({
        data: {
          action:
            report.overallStatus === 'DRIFT'
              ? AUDIT_ACTION_DRIFT
              : AUDIT_ACTION_CLEAN,
          resource: AUDIT_RESOURCE,
          changes: report as unknown as Prisma.InputJsonValue,
        },
      });

      if (report.overallStatus === 'DRIFT') {
        const breakdown = report.checks
          .filter((c) => c.status === 'DRIFT')
          .map((c) => `${c.id}: Δ=${c.deltaKd} KWD`)
          .join('; ');
        this.logger.warn(
          `[CC-RECONCILIATION] ${report.dayIsoLocal} DRIFT — ${breakdown}`,
        );
        Sentry.captureMessage(
          `[CC-RECONCILIATION] Daily collections drift on ${report.dayIsoLocal}: ${breakdown}`,
          {
            level: 'warning',
            extra: { report: report as unknown as Record<string, unknown> },
            tags: { module: 'call-center', check: 'reconciliation' },
          },
        );
      } else {
        this.logger.log(
          `[CC-RECONCILIATION] ${report.dayIsoLocal} OK — collected TH=${report.totals.transactionHistory.collectedKd} / GL=${report.totals.generalLedger.collectedKd}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `[CC-RECONCILIATION] daily check failed: ${String(err)}`,
      );
      Sentry.captureException(err, {
        tags: { module: 'call-center', check: 'reconciliation' },
      });
    }
  }

  /**
   * Latest reconciliation snapshot for the UI badge. Read-only and very
   * cheap — the cron writes one `AuditLog` row per day, so this query
   * hits an index on `resource + createdAt`.
   */
  async latestSnapshot(): Promise<{
    status: 'DRIFT' | 'MATCH';
    recordedAtIso: string;
    dayIsoLocal: string;
  } | null> {
    const row = await this.prisma.auditLog.findFirst({
      where: {
        resource: AUDIT_RESOURCE,
        action: { in: [AUDIT_ACTION_CLEAN, AUDIT_ACTION_DRIFT] },
      },
      orderBy: { createdAt: 'desc' },
      select: { action: true, changes: true, createdAt: true },
    });
    if (!row) return null;
    const payload = row.changes as unknown;
    const dayIsoLocal =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? ((payload as Record<string, unknown>).dayIsoLocal as string | undefined)
        : undefined;
    return {
      status: row.action === AUDIT_ACTION_DRIFT ? 'DRIFT' : 'MATCH',
      recordedAtIso: row.createdAt.toISOString(),
      dayIsoLocal: dayIsoLocal ?? row.createdAt.toISOString().slice(0, 10),
    };
  }
}
