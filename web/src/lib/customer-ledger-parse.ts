import type { CustomerLedgerResponse } from './api';

/**
 * Operational owed amount for display. This is NOT the canonical Customer 360
 * financial number; Customer 360 must use `statement.financials.totalDueKd`.
 */
export function parseLedgerOperationalDebtKd(
  c: CustomerLedgerResponse['customer'],
): number {
  const raw = (c.operationalDebtKd ?? c.effectiveDebtKd)?.trim();
  if (raw !== undefined && raw !== '') return Number.parseFloat(raw) || 0;
  const w = Number.parseFloat(c.walletDebtKd) || 0;
  const cr = c.collectionsReceivableKd?.trim();
  const collections =
    cr !== undefined && cr !== '' ? Number.parseFloat(cr) || 0 : 0;
  return w + collections;
}

/** @deprecated Use parseLedgerOperationalDebtKd. */
export const parseLedgerEffectiveDebtKd = parseLedgerOperationalDebtKd;
