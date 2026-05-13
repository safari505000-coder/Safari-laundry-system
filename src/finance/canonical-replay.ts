import { Prisma } from '@prisma/client';
import {
  canonicalStatementInvoiceGroup,
  computeCanonicalStatementEventProjection,
  computeCanonicalStatementTotals,
  type CanonicalStatementEventProjection,
  type CanonicalStatementInvoiceGroup,
  type CanonicalStatementTotals,
} from './canonical-financial-projection';
import {
  buildCanonicalSnapshot,
  type CanonicalSnapshotEnvelope,
} from './canonical-snapshot';

/**
 * V21 Phase 3 — Replayable Ledger Engine.
 *
 * Pure, side-effect-free reconstruction of canonical statement
 * projections from raw ledger inputs. Used by:
 *
 *  - golden contract tests (replay must equal stored projection)
 *  - audit-grade reproducibility (rebuild any historical statement
 *    from the immutable ledger)
 *  - external audit exports (deterministic snapshots)
 *
 * The replay engine MUST stay independent of:
 *  - database access
 *  - the request lifecycle
 *  - frontend math
 *  - any mutation pipeline
 *
 * It only consumes raw event/invoice rows and returns a fully-formed
 * canonical projection plus an envelope ready for hashing.
 */

/**
 * مدخلات فاتورة إعادة التشغيل — الحد الأدنى من بيانات الفاتورة اللازمة للإسقاط
 * Minimal invoice data required by the replay engine for canonical projection.
 */
export type ReplayInvoiceInput = {
  id: string;
  totalKd: string | number | Prisma.Decimal;
  status: string;
  openDebt: boolean;
};

/**
 * مدخلات حدث إعادة التشغيل — بيانات الحدث اللازمة للإسقاط الكانوني
 * Ledger event data required by the replay engine for canonical projection.
 */
export type ReplayEventInput = {
  id: string;
  atIso: string;
  kind: string;
  amountKd: string | number | Prisma.Decimal;
  balanceAfterKd: string | number | Prisma.Decimal;
  debtAfterKd: string | number | Prisma.Decimal;
  debtSettledKd: string | number | Prisma.Decimal;
  debtDiscountKd: string | number | Prisma.Decimal;
  closedInvoices?: ReadonlyArray<{
    id: string;
    totalKd: string | number | Prisma.Decimal;
  }>;
};

/**
 * فاتورة مُعاد تشغيلها مع مجموعة الإسقاط الكانونية
 * Replayed invoice enriched with its canonical statement invoice group.
 */
export type ReplayedInvoice = ReplayInvoiceInput & {
  projectionGroup: CanonicalStatementInvoiceGroup;
};

/**
 * حدث مُعاد تشغيله مع إسقاطه الكانوني
 * Replayed event enriched with its canonical statement event projection.
 */
export type ReplayedEvent = ReplayEventInput & {
  projection: CanonicalStatementEventProjection;
};

/**
 * إسقاط كشف الحساب المُعاد تشغيله مع الفواتير والأحداث والإجماليات
 * Full replayed statement projection containing invoices, events, and totals.
 */
export type ReplayedStatementProjection = {
  invoices: ReadonlyArray<ReplayedInvoice>;
  events: ReadonlyArray<ReplayedEvent>;
  totals: CanonicalStatementTotals;
};

/**
 * يُعيد بناء إسقاط كشف الحساب الكانوني من صفوف دفتر الأستاذ الخام
 * Reconstructs a canonical statement projection from raw ledger rows.
 * Deterministic: same inputs → byte-identical replay regardless of input order.
 * Events sorted by atIso then id; invoices by id.
 *
 * @param invoices - صفوف الفواتير الخام | Raw invoice input rows
 * @param events - صفوف الأحداث الخام | Raw event input rows
 * @returns إسقاط كشف الحساب المُعاد تشغيله | Replayed statement projection
 * @since V21 Phase 3
 */
export function replayStatementProjection(
  invoices: ReadonlyArray<ReplayInvoiceInput>,
  events: ReadonlyArray<ReplayEventInput>,
): ReplayedStatementProjection {
  const orderedInvoices = [...invoices].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const orderedEvents = [...events].sort((a, b) => {
    const at = a.atIso.localeCompare(b.atIso);
    return at !== 0 ? at : a.id.localeCompare(b.id);
  });

  const replayedInvoices: ReplayedInvoice[] = orderedInvoices.map((inv) => ({
    ...inv,
    totalKd: stableDecimal(inv.totalKd),
    projectionGroup: canonicalStatementInvoiceGroup(inv),
  }));

  const replayedEvents: ReplayedEvent[] = orderedEvents.map((evt) => ({
    ...evt,
    amountKd: stableDecimal(evt.amountKd),
    balanceAfterKd: stableDecimal(evt.balanceAfterKd),
    debtAfterKd: stableDecimal(evt.debtAfterKd),
    debtSettledKd: stableDecimal(evt.debtSettledKd),
    debtDiscountKd: stableDecimal(evt.debtDiscountKd),
    closedInvoices: (evt.closedInvoices ?? []).map((ci) => ({
      id: ci.id,
      totalKd: stableDecimal(ci.totalKd),
    })),
    projection: computeCanonicalStatementEventProjection(evt),
  }));

  const totals = computeCanonicalStatementTotals(
    replayedInvoices.map((inv) => ({
      totalKd: inv.totalKd,
      status: inv.status,
      openDebt: inv.openDebt,
    })),
  );

  return { invoices: replayedInvoices, events: replayedEvents, totals };
}

/**
 * Replays the statement projection AND wraps it in a canonical snapshot
 * envelope so the result is hash-verifiable, lineage-tagged and
 * deep-frozen in dev/test.
 */
export function replayStatementSnapshot(input: {
  invoices: ReadonlyArray<ReplayInvoiceInput>;
  events: ReadonlyArray<ReplayEventInput>;
  generatedAtIso?: string;
  snapshotVersion?: string;
}): CanonicalSnapshotEnvelope<ReplayedStatementProjection> {
  const projection = replayStatementProjection(input.invoices, input.events);
  return buildCanonicalSnapshot({
    payload: projection,
    sourceEventIds: projection.events.map((e) => e.id),
    sourceInvoiceIds: projection.invoices.map((i) => i.id),
    generatedAtIso: input.generatedAtIso,
    snapshotVersion: input.snapshotVersion,
  });
}

function stableDecimal(value: string | number | Prisma.Decimal): string {
  return new Prisma.Decimal(value.toString()).toFixed(4);
}
