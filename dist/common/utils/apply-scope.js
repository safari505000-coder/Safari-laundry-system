"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyScope = applyScope;
function applyScope(user, queryBuilder, options) {
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
//# sourceMappingURL=apply-scope.js.map