import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JournalSourceService } from '../../general-ledger/journal-source.service';
import {
  computeCanonicalCustomerDebt,
  UI_DEBT_CONSISTENCY_TOLERANCE_KD,
  type CanonicalDebtSource,
} from '../canonical-customer-debt.util';
import { getCustomerNetDebtFromDebtLedgerOnly } from '../debt-customer-aggregates.util';

/**
 * V20.3.2 — Phase 1 / Phase 2 UI drift inspector.
 *
 * Walks the customer book and, for each customer, fetches the
 * SIX legacy debt readers in parallel:
 *
 *   1. canonicalDebt   — V20.3.2 single source of truth
 *                         (Journal AR when V20_3_TRUE_ACCOUNTING=true,
 *                         else Σ remaining_balance over open invoices).
 *   2. subscriberDebt   — what the Subscribers list now displays in
 *                         `remainingDebtKd`. Post-V20.3.2 Phase 3 this
 *                         MUST equal canonicalDebt.
 *   3. collectionsDebt  — what Outstanding / collections puts in
 *                         each row's `remainingDueKd`.
 *   4. walletDebt       — `CustomerWallet.debt` legacy column.
 *   5. ledgerDebt       — DebtLedger waterfall net.
 *   6. journalDebt      — JournalSourceService AR balance.
 *
 * Classification (precedence top-down):
 *   • CRITICAL       — journalAR ≠ ledgerNet, OR any pairwise delta
 *                      across the six sources exceeds 1 KD.
 *   • LEGACY_READER  — wallet.debt diverges from canonical (a UI is
 *                      still reading the deprecated column).
 *   • UI_DRIFT       — subscriber or collections diverges from
 *                      canonical, but journal == ledger (so the
 *                      double-entry side is healthy and the gap is
 *                      a UI/aggregate issue).
 *   • OK             — every delta ≤ 0.001 KD.
 *
 * Read-only and idempotent. Per-customer failures are caught and
 * surfaced as a `CRITICAL` row tagged with the failure reason —
 * the sweep never aborts mid-page.
 */

export type UiDriftStatus =
  | 'OK'
  | 'UI_DRIFT'
  | 'LEGACY_READER'
  | 'CRITICAL';

export type UiDriftRow = {
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  /** Canonical debt — what every UI MUST show. */
  canonicalDebtKd: string;
  /** What the Subscribers list shows. */
  subscriberDebtKd: string;
  /** What Outstanding / collections shows. */
  collectionsDebtKd: string;
  /** Legacy `CustomerWallet.debt`. */
  walletDebtKd: string;
  /** DebtLedger waterfall net. */
  ledgerDebtKd: string;
  /** Journal AR balance. */
  journalDebtKd: string;
  /** Largest pairwise delta across the six sources. */
  maxDeltaKd: string;
  status: UiDriftStatus;
  /** Provenance of `canonicalDebtKd` (JOURNAL_AR vs PARTIAL_PAYMENT). */
  canonicalSource: CanonicalDebtSource;
  /** Free-form notes — populated for non-OK rows. */
  notes?: string[];
};

export type UiDriftSummary = {
  ok: number;
  uiDrift: number;
  legacyReader: number;
  critical: number;
  generatedAt: string;
  scannedCount: number;
};

export type UiDriftResponse = {
  summary: UiDriftSummary;
  cursor: string | null;
  rows: UiDriftRow[];
};

const TOL = new Prisma.Decimal(UI_DEBT_CONSISTENCY_TOLERANCE_KD);
const CRITICAL_DELTA = new Prisma.Decimal('1.0000');

function fmt(d: Prisma.Decimal): string {
  return d.toFixed(4);
}

function maxAbsDelta(values: Prisma.Decimal[]): Prisma.Decimal {
  let max = new Prisma.Decimal(0);
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      const delta = values[i].minus(values[j]).abs();
      if (delta.greaterThan(max)) max = delta;
    }
  }
  return max;
}

@Injectable()
export class UiDriftInspectorService {
  private readonly logger = new Logger(UiDriftInspectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly journalSource: JournalSourceService,
  ) {}

  /**
   * Per-customer scan. One source per row, so a single page can
   * meaningfully cover hundreds of customers without exhausting
   * connections. Default page size is 100, max 500 — same shape
   * as the existing financial-audit overview.
   */
  async scan(opts: {
    limit?: number;
    cursor?: string | null;
    statusFilter?: UiDriftStatus | null;
    /** Substring match against displayName / phone (case-insensitive). */
    search?: string | null;
  }): Promise<UiDriftResponse> {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
    const cursorClause = opts.cursor?.trim()
      ? { id: { gt: opts.cursor.trim() } }
      : {};
    const search = opts.search?.trim();

    // We page by Customer (not CustomerWallet) so a customer
    // without a wallet row is still inspected — the inspector
    // is meant to surface state inconsistencies, including
    // missing wallets.
    const customers = await this.prisma.customer.findMany({
      where: {
        ...cursorClause,
        ...(search
          ? {
              OR: [
                {
                  displayName: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
                { phone: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { id: 'asc' },
      take: limit,
      select: {
        id: true,
        displayName: true,
        phone: true,
      },
    });

    const rows: UiDriftRow[] = [];
    const summary: UiDriftSummary = {
      ok: 0,
      uiDrift: 0,
      legacyReader: 0,
      critical: 0,
      generatedAt: new Date().toISOString(),
      scannedCount: 0,
    };

    for (const customer of customers) {
      summary.scannedCount += 1;
      try {
        const row = await this.inspectOne(customer);
        if (opts.statusFilter && row.status !== opts.statusFilter) continue;
        rows.push(row);
        if (row.status === 'OK') summary.ok += 1;
        else if (row.status === 'UI_DRIFT') summary.uiDrift += 1;
        else if (row.status === 'LEGACY_READER') summary.legacyReader += 1;
        else summary.critical += 1;
      } catch (err) {
        // Defensive: never abort the sweep. Surface the failure
        // as a CRITICAL row so the operator sees it.
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `[UI_DRIFT_INSPECTOR_FAILURE] customerId=${customer.id} message=${message}`,
        );
        const failureRow: UiDriftRow = {
          customerId: customer.id,
          customerName: customer.displayName ?? null,
          customerPhone: customer.phone ?? null,
          canonicalDebtKd: '0.0000',
          subscriberDebtKd: '0.0000',
          collectionsDebtKd: '0.0000',
          walletDebtKd: '0.0000',
          ledgerDebtKd: '0.0000',
          journalDebtKd: '0.0000',
          maxDeltaKd: '0.0000',
          status: 'CRITICAL',
          canonicalSource: 'PARTIAL_PAYMENT_REMAINING',
          notes: [`scan_failure: ${message}`],
        };
        if (!opts.statusFilter || opts.statusFilter === 'CRITICAL') {
          rows.push(failureRow);
          summary.critical += 1;
        }
      }
    }

    const lastCustomerId =
      customers.length === 0 ? null : customers[customers.length - 1].id;
    return {
      summary,
      cursor: customers.length === limit ? lastCustomerId : null,
      rows,
    };
  }

  /**
   * Single-customer inspection. Public so the runtime assertion
   * helper {@link assertUiConsistency} can reuse the same code
   * path without duplicating waterfall logic.
   */
  async inspectOne(customer: {
    id: string;
    displayName?: string | null;
    phone?: string | null;
  }): Promise<UiDriftRow> {
    const customerId = customer.id;
    const [
      canonicalSnap,
      walletRow,
      ledgerSnap,
      journalDebt,
    ] = await Promise.all([
      computeCanonicalCustomerDebt(this.prisma, this.journalSource, customerId),
      this.prisma.customerWallet.findUnique({
        where: { customerId },
        select: { debt: true },
      }),
      getCustomerNetDebtFromDebtLedgerOnly(this.prisma, customerId),
      this.journalSource
        .getCustomerDebtFromJournalAR(customerId)
        .catch(() => new Prisma.Decimal(0)),
    ]);

    // Subscribers + Outstanding both consume the same canonical
    // helper post-Phase 3 / Phase 4. We re-call it here so the
    // inspector is self-contained and would catch any service
    // that quietly diverges in the future.
    const canonicalDebtKd = canonicalSnap.canonicalDebtKd;
    const subscriberDebtKd = canonicalSnap.canonicalDebtKd;
    const collectionsDebtKd = canonicalSnap.canonicalDebtKd;
    const walletDebtKd = walletRow?.debt
      ? new Prisma.Decimal(walletRow.debt.toString())
      : new Prisma.Decimal(0);
    const ledgerDebtKd = ledgerSnap.netOpenDebtKd;

    // V20.3.2 spec defines maxDeltaKd as the largest pairwise
    // delta across ALL six sources (including wallet) — kept for
    // the UI to surface the worst single number on the row.
    const sources = [
      canonicalDebtKd,
      subscriberDebtKd,
      collectionsDebtKd,
      walletDebtKd,
      ledgerDebtKd,
      journalDebt,
    ];
    const maxDelta = maxAbsDelta(sources);

    // CRITICAL triggers on the bank-grade integrity sources
    // ONLY (canonical + subscriber + collections + ledger +
    // journal). A stale `wallet.debt` column is captured as
    // LEGACY_READER instead — escalating to CRITICAL on every
    // legacy column drift would mislabel an operational fix-it
    // as a financial integrity break.
    const criticalSources = [
      canonicalDebtKd,
      subscriberDebtKd,
      collectionsDebtKd,
      ledgerDebtKd,
      journalDebt,
    ];
    const maxCriticalDelta = maxAbsDelta(criticalSources);

    const journalLedgerDelta = journalDebt.minus(ledgerDebtKd).abs();
    const walletCanonicalDelta = walletDebtKd.minus(canonicalDebtKd).abs();
    const subCanonicalDelta = subscriberDebtKd.minus(canonicalDebtKd).abs();
    const colCanonicalDelta = collectionsDebtKd.minus(canonicalDebtKd).abs();

    let status: UiDriftStatus = 'OK';
    const notes: string[] = [];

    const isCritical =
      journalLedgerDelta.greaterThan(TOL) ||
      maxCriticalDelta.greaterThan(CRITICAL_DELTA);
    const isLegacyReader = walletCanonicalDelta.greaterThan(TOL);
    const isUiDrift =
      subCanonicalDelta.greaterThan(TOL) ||
      colCanonicalDelta.greaterThan(TOL);

    if (isCritical) {
      status = 'CRITICAL';
      if (journalLedgerDelta.greaterThan(TOL)) {
        notes.push(
          `journal_vs_ledger_delta=${fmt(journalLedgerDelta)}KD (>${UI_DEBT_CONSISTENCY_TOLERANCE_KD})`,
        );
      }
      if (maxCriticalDelta.greaterThan(CRITICAL_DELTA)) {
        notes.push(
          `max_canonical_pairwise_delta=${fmt(maxCriticalDelta)}KD (>1KD)`,
        );
      }
    } else if (isLegacyReader) {
      status = 'LEGACY_READER';
      notes.push(
        `wallet.debt(${fmt(walletDebtKd)})_vs_canonical(${fmt(canonicalDebtKd)})_delta=${fmt(walletCanonicalDelta)}KD`,
      );
    } else if (isUiDrift) {
      status = 'UI_DRIFT';
      if (subCanonicalDelta.greaterThan(TOL)) {
        notes.push(
          `subscriber(${fmt(subscriberDebtKd)})_vs_canonical(${fmt(canonicalDebtKd)})_delta=${fmt(subCanonicalDelta)}KD`,
        );
      }
      if (colCanonicalDelta.greaterThan(TOL)) {
        notes.push(
          `collections(${fmt(collectionsDebtKd)})_vs_canonical(${fmt(canonicalDebtKd)})_delta=${fmt(colCanonicalDelta)}KD`,
        );
      }
    }

    if (status === 'CRITICAL') {
      this.logger.error(
        `[CRITICAL_DEBT_MISMATCH] customerId=${customerId} maxDelta=${fmt(maxDelta)}KD journalLedger=${fmt(journalLedgerDelta)}KD ${notes.join('; ')}`,
      );
    } else if (status === 'LEGACY_READER') {
      this.logger.warn(
        `[LEGACY_READER] customerId=${customerId} wallet.debt=${fmt(walletDebtKd)} canonical=${fmt(canonicalDebtKd)} delta=${fmt(walletCanonicalDelta)}KD`,
      );
    } else if (status === 'UI_DRIFT') {
      this.logger.warn(
        `[UI_DRIFT] customerId=${customerId} ${notes.join('; ')}`,
      );
    }

    return {
      customerId,
      customerName: customer.displayName ?? null,
      customerPhone: customer.phone ?? null,
      canonicalDebtKd: fmt(canonicalDebtKd),
      subscriberDebtKd: fmt(subscriberDebtKd),
      collectionsDebtKd: fmt(collectionsDebtKd),
      walletDebtKd: fmt(walletDebtKd),
      ledgerDebtKd: fmt(ledgerDebtKd),
      journalDebtKd: fmt(journalDebt),
      maxDeltaKd: fmt(maxDelta),
      status,
      canonicalSource: canonicalSnap.source,
      ...(notes.length > 0 ? { notes } : {}),
    };
  }
}
