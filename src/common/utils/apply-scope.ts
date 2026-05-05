export type AppScope = 'ALL' | 'BRANCH' | 'OWN';

export type ScopedUser = {
  userId?: string | number | null;
  scope?: AppScope | null;
  branchId?: string | number | null;
};

export type ApplyScopeOptions<TQuery extends Record<string, unknown>> = {
  branchField?: keyof TQuery;
  userField?: keyof TQuery;
};

/**
 * Generic request-scope helper for DTO/query objects.
 * It is intentionally shape-agnostic: callers decide which query keys represent branch/user.
 */
export function applyScope<TQuery extends Record<string, unknown>>(
  user: ScopedUser | null | undefined,
  queryBuilder: TQuery,
  options: ApplyScopeOptions<TQuery>,
): TQuery {
  const scope = user?.scope ?? 'ALL';
  if (scope === 'ALL') {
    return queryBuilder;
  }

  if (scope === 'BRANCH' && options.branchField && user?.branchId != null) {
    return {
      ...queryBuilder,
      [options.branchField]: String(user.branchId),
    };
  }

  if (scope === 'OWN' && options.userField && user?.userId != null) {
    return {
      ...queryBuilder,
      [options.userField]: String(user.userId),
    };
  }

  return queryBuilder;
}
