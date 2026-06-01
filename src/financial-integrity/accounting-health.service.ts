import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  ReconciliationService,
  type ReconciliationResultRow,
} from '../finance/reconciliation/reconciliation.service';

/**
 * Tri-state accounting integrity verdict.
 *   HEALTHY  — every invariant holds.
 *   WARNING  — drift / backlog detected that needs attention but does
 *              not prove the ledger is internally broken.
 *   CRITICAL — the ledger itself is inconsistent (trial balance off,
 *              an unbalanced entry exists, or the audit chain is broken).
 */
export type AccountingHealthStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL';

export type AccountingHealthCheck = {
  key: string;
  label: string;
  status: AccountingHealthStatus;
  metric: string | number;
  detail?: string;
};

export type AccountingHealthReport = {
  status: AccountingHealthStatus;
  generatedAt: string;
  durationMs: number;
  driftCount: number;
  criticalCount: number;
  warningCount: number;
  checks: AccountingHealthCheck[];
};

const SEVERITY_RANK: Record<AccountingHealthStatus, number> = {
  HEALTHY: 0,
  WARNING: 1,
  CRITICAL: 2,
};

/** Journal-failure backlog (24h) above this is treated as CRITICAL. */
const FAILURE_BACKLOG_CRITICAL = 5;

/**
 * FINANCIAL HARDENING — read-only accounting integrity aggregator.
 *
 * Combines the existing 5 reconciliation invariants (Trial Balance,
 * Balance-Sheet identity, Wallet-Liability match, AR integrity, Snapshot
 * match) with three additional ledger-structure checks that close the
 * remaining detection gaps:
 *
 *   • Per-entry balance scan   — proves NO single entry is unbalanced.
 *   • Audit-chain integrity    — proves the hash chain is intact.
 *   • Journal-failure backlog  — surfaces dropped (under-journaled)
 *                                writes, i.e. the 13 KD drift class.
 *   • Duplicate-posting scan   — proves no duplicate sourceRef exists.
 *
 * Never writes. Safe to run alongside live traffic and from an HTTP
 * request. The daily cron and the `GET /owner/accounting-health`
 * endpoint both call {@link computeHealth}.
 */
@Injectable()
export class AccountingHealthService {
  private readonly logger = new Logger(AccountingHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliation: ReconciliationService,
    private readonly audit: AuditLogsService,
  ) {}

  async computeHealth(): Promise<AccountingHealthReport> {
    const startedAt = Date.now();
    const generatedAt = new Date().toISOString();
    const checks: AccountingHealthCheck[] = [];

    // 1) The five banking-grade reconciliation invariants.
    let driftCount = 0;
    try {
      const recon = await this.reconciliation.runOnce();
      driftCount = recon.driftCount;
      for (const row of recon.rows) {
        checks.push(this.reconRowToCheck(row));
      }
    } catch (err) {
      checks.push({
        key: 'reconciliation',
        label: 'Reconciliation invariants',
        status: 'WARNING',
        metric: 'unavailable',
        detail: (err as Error).message,
      });
    }

    // 2) Per-entry balance scan — an unbalanced entry is always CRITICAL.
    checks.push(await this.checkPerEntryBalance());

    // 3) Audit-chain integrity.
    checks.push(await this.checkAuditChain());

    // 4) Journal-failure backlog (the under-journaling signal).
    checks.push(await this.checkFailureBacklog());

    // 5) Duplicate posting scan.
    checks.push(await this.checkDuplicatePostings());

    const criticalCount = checks.filter((c) => c.status === 'CRITICAL').length;
    const warningCount = checks.filter((c) => c.status === 'WARNING').length;
    const status: AccountingHealthStatus =
      criticalCount > 0 ? 'CRITICAL' : warningCount > 0 ? 'WARNING' : 'HEALTHY';

    return {
      status,
      generatedAt,
      durationMs: Date.now() - startedAt,
      driftCount,
      criticalCount,
      warningCount,
      checks,
    };
  }

  /**
   * Maps a reconciliation invariant row to a health check. Trial balance
   * and balance-sheet identity failures mean the journal is internally
   * inconsistent → CRITICAL. The wallet / AR / snapshot invariants are
   * read-model drift → WARNING (the ledger is still internally sound).
   */
  private reconRowToCheck(row: ReconciliationResultRow): AccountingHealthCheck {
    const hardInvariants = new Set([
      'TRIAL_BALANCE',
      'ASSETS_EQ_LIAB_PLUS_EQUITY',
    ]);
    const status: AccountingHealthStatus = row.ok
      ? 'HEALTHY'
      : hardInvariants.has(row.invariant)
        ? 'CRITICAL'
        : 'WARNING';
    return {
      key: `recon_${row.invariant.toLowerCase()}`,
      label: row.invariant,
      status,
      metric: row.deltaKd,
      detail: row.ok ? undefined : (row.detail ?? `delta=${row.deltaKd}`),
    };
  }

  private async checkPerEntryBalance(): Promise<AccountingHealthCheck> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ c: string }>>`
        SELECT COUNT(*)::text AS c FROM (
          SELECT "entryId"
          FROM "JournalLine"
          GROUP BY "entryId"
          HAVING ABS(SUM("debit") - SUM("credit")) > 0.001
        ) t
      `;
      const unbalanced = Number(rows[0]?.c ?? '0');
      return {
        key: 'per_entry_balance',
        label: 'Unbalanced journal entries',
        status: unbalanced === 0 ? 'HEALTHY' : 'CRITICAL',
        metric: unbalanced,
        detail: unbalanced === 0 ? undefined : `${unbalanced} entries have debit != credit`,
      };
    } catch (err) {
      return {
        key: 'per_entry_balance',
        label: 'Unbalanced journal entries',
        status: 'WARNING',
        metric: 'unavailable',
        detail: (err as Error).message,
      };
    }
  }

  private async checkAuditChain(): Promise<AccountingHealthCheck> {
    try {
      const result = await this.audit.verifyAuditIntegrity();
      return {
        key: 'audit_chain',
        label: 'Audit hash chain',
        status: result.valid ? 'HEALTHY' : 'CRITICAL',
        metric: result.checked,
        detail: result.valid ? undefined : `chain broken at ${result.brokenAt}`,
      };
    } catch (err) {
      return {
        key: 'audit_chain',
        label: 'Audit hash chain',
        status: 'WARNING',
        metric: 'unavailable',
        detail: (err as Error).message,
      };
    }
  }

  private async checkFailureBacklog(): Promise<AccountingHealthCheck> {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const last24h = await this.prisma.journalFailureLog.count({
        where: { createdAt: { gte: since } },
      });
      const status: AccountingHealthStatus =
        last24h === 0 ? 'HEALTHY' : last24h >= FAILURE_BACKLOG_CRITICAL ? 'CRITICAL' : 'WARNING';
      return {
        key: 'journal_failure_backlog',
        label: 'Journal write failures (24h)',
        status,
        metric: last24h,
        detail:
          last24h === 0
            ? undefined
            : `${last24h} dropped/failed journal writes in the last 24h (possible under-journaling)`,
      };
    } catch (err) {
      return {
        key: 'journal_failure_backlog',
        label: 'Journal write failures (24h)',
        status: 'WARNING',
        metric: 'unavailable',
        detail: (err as Error).message,
      };
    }
  }

  private async checkDuplicatePostings(): Promise<AccountingHealthCheck> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ c: string }>>`
        SELECT COUNT(*)::text AS c FROM (
          SELECT "sourceRef"
          FROM "JournalEntry"
          GROUP BY "sourceRef"
          HAVING COUNT(*) > 1
        ) t
      `;
      const duplicates = Number(rows[0]?.c ?? '0');
      return {
        key: 'duplicate_postings',
        label: 'Duplicate journal postings',
        status: duplicates === 0 ? 'HEALTHY' : 'CRITICAL',
        metric: duplicates,
        detail: duplicates === 0 ? undefined : `${duplicates} duplicate sourceRefs`,
      };
    } catch (err) {
      return {
        key: 'duplicate_postings',
        label: 'Duplicate journal postings',
        status: 'WARNING',
        metric: 'unavailable',
        detail: (err as Error).message,
      };
    }
  }

  /** Worst-of severity helper (exposed for the cron + tests). */
  static worstStatus(
    statuses: ReadonlyArray<AccountingHealthStatus>,
  ): AccountingHealthStatus {
    return statuses.reduce<AccountingHealthStatus>(
      (worst, s) => (SEVERITY_RANK[s] > SEVERITY_RANK[worst] ? s : worst),
      'HEALTHY',
    );
  }
}
