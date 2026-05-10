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

export type ReplayInvoiceInput = {
  id: string;
  totalKd: string | number | Prisma.Decimal;
  status: string;
  openDebt: boolean;
};

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

export type ReplayedInvoice = ReplayInvoiceInput & {
  projectionGroup: CanonicalStatementInvoiceGroup;
};

export type ReplayedEvent = ReplayEventInput & {
  projection: CanonicalStatementEventProjection;
};

export type ReplayedStatementProjection = {
  invoices: ReadonlyArray<ReplayedInvoice>;
  events: ReadonlyArray<ReplayedEvent>;
  totals: CanonicalStatementTotals;
};

/**
 * Reconstructs a canonical statement projection from raw ledger rows.
 * Outputs are deterministic: same inputs ⇒ byte-identical replay,
 * regardless of the input array order (events are sorted by ascending
 * `atIso` then `id`; invoices by ascending `id`).
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
