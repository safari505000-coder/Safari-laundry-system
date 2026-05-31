import { Prisma } from '@prisma/client';

/**
 * Operational-debt comparator extracted from `OrdersService` (Phase 3) so both
 * `OrdersService` (re-export for the existing unit spec) and the new
 * `OrderCollectionsReadService` can share it without a circular import.
 *
 * V22 — the canonical sources (`DebtLedgerEntry` net + wallet snapshot) already
 * carry the receivable once, so the old inflated `orderMarketScopeKd` comparator
 * is intentionally NOT part of the max. The parameter is kept for callers/trace
 * compatibility but does not influence the result.
 */
export function resolveOperationalDebtKd(input: {
  ledgerNetKd: Prisma.Decimal;
  snapshotFromWalletKd: Prisma.Decimal;
  orderMarketScopeKd: Prisma.Decimal;
}): Prisma.Decimal {
  return Prisma.Decimal.max(input.ledgerNetKd, input.snapshotFromWalletKd);
}
