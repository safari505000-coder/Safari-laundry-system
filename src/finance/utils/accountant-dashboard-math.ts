/**
 * Pure helpers for the accountant dashboard — easy to unit test and
 * identical to the reconciliation badge logic in AccountantDashboardService.
 */

/** UI/status uses 4dp KD amounts; treat |Δ| below this as balanced (GREEN). */
export const RECONCILIATION_BALANCE_EPS = 0.0001;

export type ReconciliationDisplayStatus = 'GREEN' | 'RED' | 'YELLOW';

/**
 * Canonical window totals:
 * - deltaKd = handed − collected (same sign as legacy `differenceKd`)
 * - shortfallKd = collected − handed (= −delta)
 *
 * Status (operator UX): GREEN balanced | RED drivers still holding (shortfall>0) |
 * YELLOW office ahead / timing (delta>0).
 *
 * Legacy {@link reconciliationBadgeFromDiff} on `handed - collected` is unchanged for API `badge`.
 */
export function reconciliationDeltaKds(
  collectedKd: number,
  handedKd: number,
): {
  deltaKd: string;
  shortfallKd: string;
  status: ReconciliationDisplayStatus;
} {
  const delta = handedKd - collectedKd;
  const shortfall = collectedKd - handedKd;
  const deltaKd = delta.toFixed(4);
  const shortfallKd = shortfall.toFixed(4);
  if (Math.abs(delta) <= RECONCILIATION_BALANCE_EPS) {
    return { deltaKd, shortfallKd, status: 'GREEN' };
  }
  if (shortfall > RECONCILIATION_BALANCE_EPS) {
    return { deltaKd, shortfallKd, status: 'RED' };
  }
  if (delta > RECONCILIATION_BALANCE_EPS) {
    return { deltaKd, shortfallKd, status: 'YELLOW' };
  }
  return { deltaKd, shortfallKd, status: 'GREEN' };
}

export function reconciliationBadgeFromDiff(diff: number): 'green' | 'yellow' | 'red' {
  if (diff > 0.0001) return 'red';
  if (diff < -0.0001) return 'yellow';
  return 'green';
}

export function kpiTrendDirection(
  curr: number,
  prev: number,
): { direction: 'up' | 'down' | 'flat'; pctVsPrevious: number } {
  if (prev === 0) {
    return {
      direction: curr > 0 ? 'up' : 'flat',
      pctVsPrevious: curr > 0 ? 100 : 0,
    };
  }
  const raw = ((curr - prev) / prev) * 100;
  const pctVsPrevious = Math.round(raw * 10) / 10;
  let direction: 'up' | 'down' | 'flat' = 'flat';
  if (pctVsPrevious > 0.5) direction = 'up';
  else if (pctVsPrevious < -0.5) direction = 'down';
  return { direction, pctVsPrevious };
}
