/**
 * دوال مساعدة بحتة للوحة معلومات المحاسب — قابلة للاختبار الوحدوي بسهولة
 * Pure helpers for the accountant dashboard (reconciliation status, badges, KPI trends).
 * Easy to unit test and shared with AccountantDashboardService.
 */

/** UI/status uses 4dp KD amounts; treat |Δ| below this as balanced (GREEN). */
const RECONCILIATION_BALANCE_EPS = 0.0001;

/**
 * حالة التسوية المرئية في لوحة المعلومات
 * Reconciliation display status for the accountant dashboard badge.
 */
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
/**
 * يحسب فروق التسوية بالدينار الكويتي وحالة العرض
 * Computes canonical reconciliation delta/shortfall amounts and display status.
 * GREEN = balanced, RED = drivers holding (shortfall > 0), YELLOW = office ahead.
 *
 * @param collectedKd - المبلغ المُحصَّل بالدينار | Collected amount KD
 * @param handedKd - المبلغ المُسلَّم بالدينار | Handed-in amount KD
 * @returns فروق التسوية وحالة العرض | Reconciliation deltas and display status
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

/**
 * يُحدد شارة التسوية بناءً على الفرق (موجب = أحمر، سالب = أصفر، صفر = أخضر)
 * Returns the reconciliation badge color from the raw diff (handed - collected).
 *
 * @param diff - الفرق الخام (مُسلَّم − مُحصَّل) | Raw diff (handed - collected)
 * @returns لون الشارة | Badge color: 'green' | 'yellow' | 'red'
 */
export function reconciliationBadgeFromDiff(diff: number): 'green' | 'yellow' | 'red' {
  if (diff > 0.0001) return 'red';
  if (diff < -0.0001) return 'yellow';
  return 'green';
}

/**
 * يحسب اتجاه الاتجاه ونسبة التغيير لمؤشرات الأداء الرئيسية
 * Computes the KPI trend direction (up/down/flat) and percentage vs previous period.
 *
 * @param curr - القيمة الحالية | Current period value
 * @param prev - القيمة السابقة | Previous period value
 * @returns اتجاه الاتجاه والنسبة | Trend direction and percentage change
 */
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
