/**
 * V19.26 — Consistent branch / employee ordering for مسير الرواتب and
 * payroll team grids. Null sort keys sort last, then Arabic name.
 */
const NULL_SORT = 9_999_999;

export function compareBranchesForPayrollRoster(
  a: { name: string; payrollRosterSortOrder?: number | null },
  b: { name: string; payrollRosterSortOrder?: number | null },
): number {
  const oa = a.payrollRosterSortOrder ?? NULL_SORT;
  const ob = b.payrollRosterSortOrder ?? NULL_SORT;
  if (oa !== ob) return oa - ob;
  return a.name.localeCompare(b.name, 'ar');
}

export function comparePayrollRowsForRoster(
  a: { user: { fullName: string; payrollRosterLineOrder?: number | null } },
  b: { user: { fullName: string; payrollRosterLineOrder?: number | null } },
): number {
  const oa = a.user.payrollRosterLineOrder ?? NULL_SORT;
  const ob = b.user.payrollRosterLineOrder ?? NULL_SORT;
  if (oa !== ob) return oa - ob;
  return a.user.fullName.localeCompare(b.user.fullName, 'ar');
}

export function compareTeamUsersForPayrollRoster(
  a: { fullName: string; payrollRosterLineOrder?: number | null },
  b: { fullName: string; payrollRosterLineOrder?: number | null },
): number {
  const oa = a.payrollRosterLineOrder ?? NULL_SORT;
  const ob = b.payrollRosterLineOrder ?? NULL_SORT;
  if (oa !== ob) return oa - ob;
  return a.fullName.localeCompare(b.fullName, 'ar');
}
