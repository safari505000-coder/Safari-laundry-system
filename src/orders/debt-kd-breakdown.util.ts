import { Prisma } from '@prisma/client';

const EPS = new Prisma.Decimal('0.0001');

function approxEq(a: Prisma.Decimal, b: Prisma.Decimal): boolean {
  return a.sub(b).abs().lte(EPS);
}

export type DebtKdBreakdownWinner = 'ledger' | 'walletSnapshot' | 'orderMarket';

/** Serialized for API/clients — see `OrdersService.getOperationalDebtKdBreakdown`. */
export type DebtKdBreakdownTrace = {
  ledgerNetKd: string;
  walletSnapshotKd: string;
  orderMarketScopeKd: string;
  /** Operational debt only. This is NOT the canonical financial number. */
  operationalDebtKd: string;
  winningSources: DebtKdBreakdownWinner[];
};

/** Which of the three ceilings matched `effective` (tie → multiple entries). */
export function buildDebtKdBreakdownTrace(
  ledgerNetKd: Prisma.Decimal,
  walletSnapshotKd: Prisma.Decimal,
  orderMarketScopeKd: Prisma.Decimal,
  effectiveKd: Prisma.Decimal,
): DebtKdBreakdownTrace {
  const winningSources: DebtKdBreakdownWinner[] = [];
  if (approxEq(ledgerNetKd, effectiveKd)) winningSources.push('ledger');
  if (approxEq(walletSnapshotKd, effectiveKd)) winningSources.push('walletSnapshot');
  if (approxEq(orderMarketScopeKd, effectiveKd)) winningSources.push('orderMarket');
  if (winningSources.length === 0) {
    winningSources.push('walletSnapshot');
  }
  return {
    ledgerNetKd: ledgerNetKd.toFixed(4),
    walletSnapshotKd: walletSnapshotKd.toFixed(4),
    orderMarketScopeKd: orderMarketScopeKd.toFixed(4),
    operationalDebtKd: effectiveKd.toFixed(4),
    winningSources,
  };
}
