import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CURRENT_SCHEMA_VERSION,
  type FinancialSnapshotInput,
  type FinancialSnapshotRow,
  type SnapshotRefreshSource,
} from './financial-snapshot.types';

/**
 * V20.4 — Phase 1 storage layer for the read-side projection.
 *
 * Pure persistence; no business logic, no journal reads.
 * {@link FinancialSnapshotService} owns the rebuild rules; this
 * class only translates the projector's `FinancialSnapshotInput`
 * into Prisma upserts and exposes ergonomic query helpers for
 * {@link DebtVisibilityService}.
 *
 * Append/update only:
 *   • `upsert(...)` is the only mutating entry point;
 *   • `delete*` paths are intentionally absent — projection rows
 *     are recomputed, never deleted, even when a customer's
 *     wallet flips back to zero. (Operators who truly need to
 *     clear a row run the deterministic rebuild instead.)
 */
@Injectable()
export class FinancialSnapshotRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent write of one customer's projection. Always sets
   * `schemaVersion` to {@link CURRENT_SCHEMA_VERSION} so a cron
   * sweep that finds an older row knows it's stale.
   *
   * `refreshContext` is shallow-merged so operators can append a
   * `{ source, correlationId }` envelope without losing earlier
   * keys (e.g. a previous projector dropped a `priorBalance` for
   * forensic comparison).
   */
  async upsert(
    input: FinancialSnapshotInput,
    source: SnapshotRefreshSource,
    correlationId?: string | null,
  ): Promise<FinancialSnapshotRow> {
    const refreshContext: Prisma.InputJsonValue = {
      source,
      correlationId: correlationId ?? null,
      writtenAt: new Date().toISOString(),
      ...((input.refreshContext as Record<string, unknown> | null | undefined) ??
        {}),
    };
    const data = {
      journalArBalanceKd: input.journalArBalanceKd,
      remainingDebtKd: input.remainingDebtKd,
      paidTotalKd: input.paidTotalKd,
      totalInvoicesKd: input.totalInvoicesKd,
      unpaidInvoicesCount: input.unpaidInvoicesCount,
      partiallyPaidInvoicesCount: input.partiallyPaidInvoicesCount,
      activeInvoicesCount: input.activeInvoicesCount,
      overdueInvoicesCount: input.overdueInvoicesCount,
      walletBalanceKd: input.walletBalanceKd,
      walletLiabilityKd: input.walletLiabilityKd,
      lastPaymentAt: input.lastPaymentAt,
      lastInvoiceAt: input.lastInvoiceAt,
      canonicalSource: input.canonicalSource,
      v20_3TrueAccountingActive: input.v20_3TrueAccountingActive,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      refreshedAt: new Date(),
      refreshContext,
      // V20.5 — Phase 7 materialised projections. Defaults preserve
      // the V20.4 behaviour ("missing → safe baseline") for any
      // call site that hasn't been upgraded yet.
      agingBucket: input.agingBucket ?? 'CURRENT',
      riskLevel: input.riskLevel ?? 'LOW',
      riskScore: input.riskScore ?? 0,
      collectionsStage: input.collectionsStage ?? 'NEW',
      overdueAmountKd: input.overdueAmountKd ?? new Prisma.Decimal(0),
      oldestOverdueDays: input.oldestOverdueDays ?? 0,
    } satisfies Prisma.FinancialSnapshotUpdateInput;
    const row = await this.prisma.financialSnapshot.upsert({
      where: { customerId: input.customerId },
      create: { customerId: input.customerId, ...data },
      update: data,
    });
    return this.mapRow(row);
  }

  /**
   * Single-customer fetch. `null` when no projection exists yet —
   * callers must fall back to live computation, never assume zero.
   */
  async findByCustomerId(
    customerId: string,
  ): Promise<FinancialSnapshotRow | null> {
    const row = await this.prisma.financialSnapshot.findUnique({
      where: { customerId },
    });
    return row ? this.mapRow(row) : null;
  }

  /**
   * Batch fetch for paginated read APIs (Subscribers list,
   * Outstanding). Returns a `Map<customerId, row>` to keep the
   * caller side O(1) lookup.
   */
  async findManyByCustomerIds(
    customerIds: string[],
  ): Promise<Map<string, FinancialSnapshotRow>> {
    const out = new Map<string, FinancialSnapshotRow>();
    if (customerIds.length === 0) return out;
    const rows = await this.prisma.financialSnapshot.findMany({
      where: { customerId: { in: customerIds } },
    });
    for (const r of rows) out.set(r.customerId, this.mapRow(r));
    return out;
  }

  /**
   * Cron-driven sweep helper. Returns customer ids whose snapshot
   * is older than `staleAfter` OR whose `schemaVersion` is below
   * the current projector version.
   */
  async findStaleCustomerIds(opts: {
    staleAfter: Date;
    limit: number;
  }): Promise<string[]> {
    const rows = await this.prisma.financialSnapshot.findMany({
      where: {
        OR: [
          { refreshedAt: { lt: opts.staleAfter } },
          { schemaVersion: { lt: CURRENT_SCHEMA_VERSION } },
        ],
      },
      orderBy: { refreshedAt: 'asc' },
      take: opts.limit,
      select: { customerId: true },
    });
    return rows.map((r) => r.customerId);
  }

  /**
   * Customers known to the system but missing a projection row.
   * Drives the first-time backfill on cron startup.
   */
  async findCustomersWithoutSnapshot(limit: number): Promise<string[]> {
    const rows = await this.prisma.customer.findMany({
      where: { financialSnapshot: null },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private mapRow(
    row: Prisma.FinancialSnapshotGetPayload<Record<string, never>>,
  ): FinancialSnapshotRow {
    return {
      id: row.id,
      customerId: row.customerId,
      journalArBalanceKd: row.journalArBalanceKd,
      remainingDebtKd: row.remainingDebtKd,
      paidTotalKd: row.paidTotalKd,
      totalInvoicesKd: row.totalInvoicesKd,
      unpaidInvoicesCount: row.unpaidInvoicesCount,
      partiallyPaidInvoicesCount: row.partiallyPaidInvoicesCount,
      activeInvoicesCount: row.activeInvoicesCount,
      overdueInvoicesCount: row.overdueInvoicesCount,
      walletBalanceKd: row.walletBalanceKd,
      walletLiabilityKd: row.walletLiabilityKd,
      lastPaymentAt: row.lastPaymentAt,
      lastInvoiceAt: row.lastInvoiceAt,
      canonicalSource:
        row.canonicalSource as FinancialSnapshotRow['canonicalSource'],
      v20_3TrueAccountingActive: row.v20_3TrueAccountingActive,
      schemaVersion: row.schemaVersion,
      refreshedAt: row.refreshedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      refreshContext:
        (row.refreshContext as Prisma.InputJsonValue | null) ?? null,
      // V20.5 — Phase 7 read-side projections (always present in
      // the row thanks to default-valued migration columns).
      agingBucket: row.agingBucket as FinancialSnapshotRow['agingBucket'],
      riskLevel: row.riskLevel as FinancialSnapshotRow['riskLevel'],
      riskScore: row.riskScore,
      collectionsStage:
        row.collectionsStage as FinancialSnapshotRow['collectionsStage'],
      overdueAmountKd: row.overdueAmountKd,
      oldestOverdueDays: row.oldestOverdueDays,
    };
  }
}
