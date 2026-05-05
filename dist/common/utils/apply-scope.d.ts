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
export declare function applyScope<TQuery extends Record<string, unknown>>(user: ScopedUser | null | undefined, queryBuilder: TQuery, options: ApplyScopeOptions<TQuery>): TQuery;
