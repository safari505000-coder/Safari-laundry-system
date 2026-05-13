import { Injectable, Logger } from '@nestjs/common';
import {
  CustomerSubscriptionStatus,
  GeneralLedgerEntryType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * V20.4 — Phase 8 unified customer financial timeline.
 *
 * One ordered stream of every meaningful financial event for a
 * customer. Operators (Customer 360, Accountant dashboard) get
 * a single API to render the audit trail without joining five
 * separate tables.
 *
 * Sources merged in chronological order:
 *   • `Order`                       → INVOICE_ISSUED
 *   • `DebtLedgerEntry` (real PAYMENT)   → PAYMENT_RECORDED
 *   • `DebtLedgerEntry` (partial)        → PARTIAL_PAYMENT
 *   • `DebtLedgerEntry` (wallet absorb)  → WALLET_ABSORBED
 *   • `DebtLedgerEntry` (INVOICE_SHORTFALL/SUBSCRIPTION_OVERUSE)
 *                                   → DEBT_ACCRUED
 *   • `CustomerSubscription`        → SUBSCRIPTION_ACTIVATED /
 *                                     SUBSCRIPTION_EXPIRED
 *   • `GeneralLedgerEntry` (DEBT_ADJUSTMENT / WALLET_SETTLEMENT)
 *                                   → REVERSAL (covers writeoff /
 *                                     cancellation today; future
 *                                     enum additions slot in here)
 *   • `CustomerCollectionStatus`    → COLLECTION_REMINDER /
 *                                     COLLECTION_ESCALATED (when status
 *                                     transitions stored)
 *
 * Pure read; no mutation. Pagination is by `before` cursor
 * (ISO timestamp) for cheap "load older" UI behavior.
 */

export type FinancialTimelineEventKind =
  | 'INVOICE_ISSUED'
  | 'PAYMENT_RECORDED'
  | 'PARTIAL_PAYMENT'
  | 'WALLET_ABSORBED'
  | 'DEBT_ACCRUED'
  | 'SUBSCRIPTION_ACTIVATED'
  | 'SUBSCRIPTION_EXPIRED'
  | 'COLLECTION_REMINDER'
  | 'COLLECTION_ESCALATED'
  | 'DEBT_WRITE_OFF'
  | 'REVERSAL'
  // V20.5 — Phase 4 additions: append-only ops events.
  | 'PROMISE_CREATED'
  | 'PROMISE_KEPT'
  | 'PROMISE_BROKEN'
  | 'PROMISE_CANCELLED'
  | 'COLLECTIONS_STAGE_CHANGED'
  | 'JOURNAL_ENTRY';

export type FinancialTimelineEvent = {
  kind: FinancialTimelineEventKind;
  /** Stable id within its source table (orderId, ledgerRowId, …). */
  id: string;
  occurredAt: string;
  amountKd: string | null;
  /** Free-form note shown next to the row (Arabic / English). */
  note: string | null;
  /** Order id when the event is invoice-bound. */
  orderId: string | null;
  /** Caller-facing source string for log triage. */
  source: string;
  /** Optional structured context (paymentMethod, planName, ledger ids). */
  metadata?: Record<string, string | number | null>;
};

export type FinancialTimelineResponse = {
  customerId: string;
  generatedAt: string;
  /** ISO-8601 of the oldest event returned — pass to next call as `before`. */
  nextBeforeCursor: string | null;
  events: FinancialTimelineEvent[];
};

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

@Injectable()
export class FinancialTimelineService {
  private readonly logger = new Logger(FinancialTimelineService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public entry — `GET /api/finance/timeline/:customerId`.
   *
   * `before` returns events strictly older than the given ISO
   * timestamp, enabling efficient "load older" pagination
   * without offset arithmetic.
   */
  async getTimeline(
    customerId: string,
    opts: { limit?: number; before?: Date | string | null } = {},
  ): Promise<FinancialTimelineResponse> {
    const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
    const before =
      opts.before instanceof Date
        ? opts.before
        : opts.before
          ? new Date(opts.before)
          : null;

    const [orders, ledger, subs, gl, promises, stageEvents, journal] =
      await Promise.all([
        this.fetchOrderEvents(customerId, before, limit),
        this.fetchLedgerEvents(customerId, before, limit),
        this.fetchSubscriptionEvents(customerId, before, limit),
        this.fetchGeneralLedgerEvents(customerId, before, limit),
        this.fetchPromiseEvents(customerId, before, limit),
        this.fetchCollectionsStageEvents(customerId, before, limit),
        this.fetchJournalEvents(customerId, before, limit),
      ]);

    const merged = [
      ...orders,
      ...ledger,
      ...subs,
      ...gl,
      ...promises,
      ...stageEvents,
      ...journal,
    ].sort((a, b) => {
      // Newest first — the API contract is reverse-chronological
      // because that's what the UI scrolls naturally.
      return Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
    });

    const sliced = merged.slice(0, limit);
    const nextBeforeCursor =
      sliced.length === limit ? sliced[sliced.length - 1].occurredAt : null;

    return {
      customerId,
      generatedAt: new Date().toISOString(),
      nextBeforeCursor,
      events: sliced,
    };
  }

  // ── Source fetchers ──────────────────────────────────────────

  private async fetchOrderEvents(
    customerId: string,
    before: Date | null,
    limit: number,
  ): Promise<FinancialTimelineEvent[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        customerId,
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        totalPrice: true,
        createdAt: true,
        posPaymentMethod: true,
        cashStatus: true,
      },
    });
    return orders.map((o) => ({
      kind: 'INVOICE_ISSUED' as const,
      id: `order:${o.id}`,
      occurredAt: o.createdAt.toISOString(),
      amountKd: new Prisma.Decimal(o.totalPrice.toString()).toFixed(4),
      note: null,
      orderId: o.id,
      source: 'Order',
      metadata: {
        posPaymentMethod: o.posPaymentMethod ?? null,
        cashStatus: o.cashStatus,
      },
    }));
  }

  private async fetchLedgerEvents(
    customerId: string,
    before: Date | null,
    limit: number,
  ): Promise<FinancialTimelineEvent[]> {
    // V20.4 — DebtLedger removed; read payment/debt events from JournalEntry.
    // Amount = CR on 1300 (PAYMENT events) or DR on 1300 (issuance/accrual).
    const entries = await this.prisma.journalEntry.findMany({
      where: {
        customerId,
        source: { in: ['PAYMENT', 'INVOICE', 'ORDER_INVOICE', 'DEBT_DISCOUNT', 'ADJUSTMENT'] },
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        source: true,
        sourceRef: true,
        orderId: true,
        actorUserId: true,
        createdAt: true,
        lines: {
          where: { account: { code: '1300' } },
          select: { debit: true, credit: true },
        },
      },
    });
    return entries.map((e) => {
      const arCredit = e.lines.reduce((s, l) => s.add(l.credit), new Prisma.Decimal(0));
      const arDebit  = e.lines.reduce((s, l) => s.add(l.debit),  new Prisma.Decimal(0));
      const isPayment = e.source === 'PAYMENT';
      const amountKd = (isPayment ? arCredit : arDebit).toFixed(4);
      let kind: FinancialTimelineEventKind;
      if (isPayment) {
        kind = (e.sourceRef ?? '').startsWith('PAYMENT:WALLET:')
          ? 'WALLET_ABSORBED'
          : 'PAYMENT_RECORDED';
      } else if (e.source === 'DEBT_DISCOUNT') {
        kind = 'PARTIAL_PAYMENT';
      } else {
        kind = 'DEBT_ACCRUED';
      }
      return {
        kind,
        id: `journal:${e.id}`,
        occurredAt: e.createdAt.toISOString(),
        amountKd,
        note: null,
        orderId: e.orderId ?? null,
        source: 'JournalEntry',
        metadata: {
          journalSource: e.source,
          sourceRef: e.sourceRef ?? null,
          actorUserId: e.actorUserId ?? null,
        },
      };
    });
  }

  private async fetchSubscriptionEvents(
    customerId: string,
    before: Date | null,
    limit: number,
  ): Promise<FinancialTimelineEvent[]> {
    const subs = await this.prisma.customerSubscription.findMany({
      where: {
        customerId,
        ...(before ? { activatedAt: { lt: before } } : {}),
      },
      orderBy: { activatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        status: true,
        activatedAt: true,
        expiresAt: true,
        planNameSnapshot: true,
        planSalePriceSnapshot: true,
      },
    });
    const events: FinancialTimelineEvent[] = [];
    const now = Date.now();
    for (const s of subs) {
      events.push({
        kind: 'SUBSCRIPTION_ACTIVATED' as const,
        id: `subscription_activate:${s.id}`,
        occurredAt: s.activatedAt.toISOString(),
        amountKd: s.planSalePriceSnapshot
          ? new Prisma.Decimal(s.planSalePriceSnapshot.toString()).toFixed(4)
          : null,
        note: s.planNameSnapshot ?? null,
        orderId: null,
        source: 'CustomerSubscription',
        metadata: { status: s.status },
      });
      if (
        s.expiresAt.getTime() < now &&
        s.status !== CustomerSubscriptionStatus.ACTIVE
      ) {
        events.push({
          kind: 'SUBSCRIPTION_EXPIRED' as const,
          id: `subscription_expire:${s.id}`,
          occurredAt: s.expiresAt.toISOString(),
          amountKd: null,
          note: s.planNameSnapshot ?? null,
          orderId: null,
          source: 'CustomerSubscription',
          metadata: { status: s.status },
        });
      }
    }
    return events;
  }

  private async fetchGeneralLedgerEvents(
    customerId: string,
    before: Date | null,
    limit: number,
  ): Promise<FinancialTimelineEvent[]> {
    const rows = await this.prisma.generalLedgerEntry.findMany({
      where: {
        customerId,
        entryType: {
          in: [
            GeneralLedgerEntryType.DEBT_ADJUSTMENT,
            GeneralLedgerEntryType.WALLET_SETTLEMENT,
          ],
        },
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        entryType: true,
        amount: true,
        memo: true,
        orderId: true,
        createdAt: true,
      },
    });
    return rows.map((r) => ({
      kind: 'REVERSAL' as const,
      id: `gl:${r.id}`,
      occurredAt: r.createdAt.toISOString(),
      amountKd: r.amount
        ? new Prisma.Decimal(r.amount.toString()).toFixed(4)
        : null,
      note: r.memo ?? null,
      orderId: r.orderId ?? null,
      source: 'GeneralLedgerEntry',
      metadata: { entryType: r.entryType },
    }));
  }

  /**
   * V20.5 — Phase 4 Promise-to-Pay events (append-only audit rows).
   * Filtered to this customer via the join on PromiseToPay.customerId.
   */
  private async fetchPromiseEvents(
    customerId: string,
    before: Date | null,
    limit: number,
  ): Promise<FinancialTimelineEvent[]> {
    const rows = await this.prisma.promiseEvent.findMany({
      where: {
        promise: { customerId },
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        kind: true,
        actorId: true,
        payload: true,
        createdAt: true,
        promise: {
          select: {
            id: true,
            invoiceId: true,
            promisedAmount: true,
            promisedDate: true,
          },
        },
      },
    });
    return rows.map((r) => {
      const kind: FinancialTimelineEventKind =
        r.kind === 'KEPT'
          ? 'PROMISE_KEPT'
          : r.kind === 'BROKEN'
            ? 'PROMISE_BROKEN'
            : r.kind === 'CANCELLED'
              ? 'PROMISE_CANCELLED'
              : 'PROMISE_CREATED';
      return {
        kind,
        id: `promise_event:${r.id}`,
        occurredAt: r.createdAt.toISOString(),
        amountKd: new Prisma.Decimal(
          r.promise.promisedAmount.toString(),
        ).toFixed(4),
        note: null,
        orderId: r.promise.invoiceId ?? null,
        source: 'PromiseEvent',
        metadata: {
          promiseId: r.promise.id,
          actorId: r.actorId ?? null,
          promisedDateIso: r.promise.promisedDate.toISOString(),
        },
      };
    });
  }

  /**
   * V20.5 — Phase 4 Collections stage transitions.
   * Joined through CollectionsAccount.customerId.
   */
  private async fetchCollectionsStageEvents(
    customerId: string,
    before: Date | null,
    limit: number,
  ): Promise<FinancialTimelineEvent[]> {
    const rows = await this.prisma.collectionsStageEvent.findMany({
      where: {
        account: { customerId },
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        fromStage: true,
        toStage: true,
        actorId: true,
        reason: true,
        createdAt: true,
      },
    });
    return rows.map((r) => ({
      kind: 'COLLECTIONS_STAGE_CHANGED' as const,
      id: `collections_stage:${r.id}`,
      occurredAt: r.createdAt.toISOString(),
      amountKd: null,
      note: r.reason ?? null,
      orderId: null,
      source: 'CollectionsStageEvent',
      metadata: {
        fromStage: r.fromStage ?? null,
        toStage: r.toStage,
        actorId: r.actorId ?? null,
      },
    }));
  }

  /**
   * V20.5 — Phase 4 raw journal entries for this customer. Provides
   * the canonical "what hit the books" view alongside the
   * derived/legacy events. Reads from JournalEntry which is
   * append-only by trigger; the timeline therefore inherits the
   * forensic-grade immutability of the underlying source.
   */
  private async fetchJournalEvents(
    customerId: string,
    before: Date | null,
    limit: number,
  ): Promise<FinancialTimelineEvent[]> {
    const rows = await this.prisma.journalEntry.findMany({
      where: {
        customerId,
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        source: true,
        sourceRef: true,
        createdAt: true,
        orderId: true,
      },
    });
    return rows.map((r) => ({
      kind: 'JOURNAL_ENTRY' as const,
      id: `journal:${r.id}`,
      occurredAt: r.createdAt.toISOString(),
      amountKd: null,
      note: null,
      orderId: r.orderId ?? null,
      source: 'JournalEntry',
      metadata: {
        journalSource: r.source,
        sourceRef: r.sourceRef,
      },
    }));
  }
}
