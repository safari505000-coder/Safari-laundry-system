/** Fired after payroll / fixed-expense changes so Reports executive cards can refetch. */
export const EXECUTIVE_SUMMARY_REFRESH_EVENT = 'safari:executive-summary-refresh';

export function requestExecutiveSummaryRefresh(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EXECUTIVE_SUMMARY_REFRESH_EVENT));
}
