export const BRANCHES_LIST_REFRESH_EVENT = 'safari:branches-list-refresh';

export function requestBranchesListRefresh(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(BRANCHES_LIST_REFRESH_EVENT));
}
