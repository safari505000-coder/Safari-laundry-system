import type { CustomerLedgerResponse } from './api';

/**
 * Total owed for display: preferred server field `effectiveDebtKd`, else
 * wallet + collections (legacy clients before V19.8.11).
 */
export function parseLedgerEffectiveDebtKd(
  c: CustomerLedgerResponse['customer'],
): number {
  const raw = c.effectiveDebtKd?.trim();
  if (raw !== undefined && raw !== '') return Number.parseFloat(raw) || 0;
  const w = Number.parseFloat(c.walletDebtKd) || 0;
  const cr = c.collectionsReceivableKd?.trim();
  const collections =
    cr !== undefined && cr !== '' ? Number.parseFloat(cr) || 0 : 0;
  return w + collections;
}
