import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { KUWAIT_TIMEZONE } from '../common/time/kuwait-time';
import { PrismaService } from '../prisma/prisma.service';
import { DoubleEntryJournalService } from './double-entry-journal.service';
import { getCustomerNetDebtFromDebtLedgerOnly } from '../finance/debt-customer-aggregates.util';

/**
 * V20.1 — Daily journal drift detection.
 *
 * Compares two **independent** computations of customer AR:
 *   1) `DebtLedgerEntry` net (canonical "what the customer owes us").
 *   2) `JournalEntry` AR account balance (double-entry mirror).
 *
 * They MUST match within 0.001 KD. Any drift indicates either:
 *   • a `DebtLedgerEntry` write whose journal mirror failed silently
 *     (e.g. unknown sourceRef prefix), or
 *   • a journal write whose ledger row was rolled back / never created.
 *
 * The cron only logs (`console.error('[JOURNAL_DRIFT]', …)` via
 * {@link DoubleEntryJournalService.logCustomerDrift}) — it never
 * mutates state. Investigators triage from log output and the
 * `/general-ledger/customer/:id/statement` endpoint.
 *
 * Disable with `JOURNAL_DRIFT_CRON_DISABLED=true`.
 *
 * Scope: customers with ANY DebtLedgerEntry activity in the last
 * 30 days. Older accounts are stable; checking the entire customer
 * book on every run would be wasteful and noisy.
 */
@Injectable()
export class JournalDriftCron {
  private readonly logger = new Logger(JournalDriftCron.name);
  private isRunning = false;
  private lastRanAtIso: string | null = null;
  private lastCheckedCount = 0;
  private lastDriftCount = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly journal: DoubleEntryJournalService,
  ) {}

  @Cron('0 30 6 * * *', {
    name: 'general-ledger.journal-drift',
    timeZone: KUWAIT_TIMEZONE,
  })
  async run(): Promise<void> {
    if (process.env.JOURNAL_DRIFT_CRON_DISABLED === 'true') {
      this.logger.log('[JournalDriftCron] disabled via env');
      return;
    }
    if (this.isRunning) {
      this.logger.warn('[JournalDriftCron] previous run still in flight; skipping');
      return;
    }
    this.isRunning = true;
    const startedAt = Date.now();
    let checked = 0;
    let drifts = 0;
    try {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recent = await this.prisma.debtLedgerEntry.findMany({
        where: { createdAt: { gte: since } },
        distinct: ['customerId'],
        select: { customerId: true },
        take: 5_000,
      });
      for (const { customerId } of recent) {
        try {
          const ledgerNet = await getCustomerNetDebtFromDebtLedgerOnly(
            this.prisma,
            customerId,
          );
          const journalBalance =
            await this.journal.getCustomerBalanceFromJournal(customerId);
          const ledger = ledgerNet.netOpenDebtKd;
          if (ledger.sub(journalBalance).abs().gt(new Prisma.Decimal('0.001'))) {
            drifts += 1;
            await this.journal.logCustomerDrift(customerId, ledger);
          }
          checked += 1;
        } catch (err) {
          this.logger.error(
            `[JournalDriftCron] failed customerId=${customerId}: ${(err as Error).message}`,
          );
        }
      }
      this.lastCheckedCount = checked;
      this.lastDriftCount = drifts;
      this.lastRanAtIso = new Date().toISOString();
      const ms = Date.now() - startedAt;
      this.logger.log(
        `[JournalDriftCron] checked=${checked} drifts=${drifts} elapsedMs=${ms}`,
      );
    } catch (err) {
      this.logger.error(
        `[JournalDriftCron] run failed: ${(err as Error).message}`,
      );
    } finally {
      this.isRunning = false;
    }
  }

  /** Diagnostic accessor — used by `/health/journal-drift` if exposed. */
  getStatus(): {
    lastRanAtIso: string | null;
    lastCheckedCount: number;
    lastDriftCount: number;
  } {
    return {
      lastRanAtIso: this.lastRanAtIso,
      lastCheckedCount: this.lastCheckedCount,
      lastDriftCount: this.lastDriftCount,
    };
  }
}
